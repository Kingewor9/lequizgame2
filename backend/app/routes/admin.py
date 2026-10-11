from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import Quiz, Question, Option, FootyCoinTask, User
from app.utils import generate_id, format_success, format_error
from app.services.telegram_service import get_telegram_service
from datetime import datetime, timedelta
from functools import wraps
from urllib.parse import urlparse

admin_bp = Blueprint('admin', __name__, url_prefix='/api/admin')

def admin_required(fn):
    @wraps(fn)
    @jwt_required()
    def wrapper(*args, **kwargs):
        current_user_id = get_jwt_identity()
        user = User.objects(id=current_user_id).first()
        
        if not user:
            return jsonify(format_error('User not found')), 404
            
        admin_ids = current_app.config.get('ADMIN_TELEGRAM_IDS', [])
        if user.telegram_id not in admin_ids:
            return jsonify(format_error('Admin privileges required')), 403
            
        return fn(*args, **kwargs)
    return wrapper


@admin_bp.route('/broadcast', methods=['POST'])
@admin_required
def broadcast_message():
    """Queue a message broadcast to all registered users (Admin only)."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(format_error('A JSON request body is required')), 400

    message = data.get('message')
    if not isinstance(message, str) or not message.strip():
        return jsonify(format_error('A message is required')), 400
    message = message.strip()
    if len(message) > 4096:
        return jsonify(format_error('Messages must be 4,096 characters or fewer')), 400

    image_url = data.get('image_url')
    cta_link = data.get('cta_link')
    cta_text = data.get('cta_text')
    for field, value in (('image_url', image_url), ('cta_link', cta_link)):
        if value is not None:
            if not isinstance(value, str):
                return jsonify(format_error(f'{field} must be a URL')), 400
            parsed_url = urlparse(value.strip())
            if parsed_url.scheme != 'https' or not parsed_url.netloc:
                return jsonify(format_error(f'{field} must be a valid HTTPS URL')), 400
            if field == 'image_url':
                image_url = value.strip()
            else:
                cta_link = value.strip()

    if cta_text is not None:
        if not isinstance(cta_text, str):
            return jsonify(format_error('cta_text must be text')), 400
        cta_text = cta_text.strip()
        if not cta_text or len(cta_text) > 64:
            return jsonify(format_error('Button text must be between 1 and 64 characters')), 400

    if bool(cta_link) != bool(cta_text):
        return jsonify(format_error('Provide both a CTA link and button text')), 400
    if image_url and len(message) > 1024:
        return jsonify(format_error('Messages sent with an image must be 1,024 characters or fewer')), 400

    try:
        telegram_service = get_telegram_service()
        if not telegram_service.bot_token:
            return jsonify(format_error('Telegram bot is not configured')), 503
        telegram_ids = list({
            user.telegram_id
            for user in User.objects(telegram_id__ne=None).only('telegram_id')
            if user.telegram_id
        })
        if not telegram_service.send_broadcast(
            telegram_ids,
            message,
            image_url=image_url,
            cta_link=cta_link,
            cta_text=cta_text,
            async_send=True,
        ):
            return jsonify(format_error('The broadcast could not be queued')), 500

        return jsonify(format_success(
            data={'recipient_count': len(telegram_ids)},
            message='Broadcast queued for delivery',
        )), 202
    except Exception as error:
        current_app.logger.exception('Could not queue admin broadcast')
        return jsonify(format_error(str(error))), 500


@admin_bp.route('/quizzes', methods=['POST'])
@admin_required
def create_quiz():
    """Create a new quiz (Admin only)"""
    try:
        data = request.get_json()
        
        # Validate required fields
        required = ['name', 'total_questions', 'time_limit_seconds', 'total_points']
        for field in required:
            if field not in data:
                return jsonify(format_error(f'Missing: {field}')), 400
        
        # Set expiration to 24 hours from now by default
        expires_at = datetime.utcnow() + timedelta(hours=24)
        if 'expires_at' in data:
            expires_at = datetime.fromisoformat(data['expires_at'])
        
        quiz = Quiz(
            id=generate_id(),
            name=data['name'],
            description=data.get('description'),
            total_questions=data['total_questions'],
            time_limit_seconds=data['time_limit_seconds'],
            points_per_question=data.get('points_per_question', 10),
            total_points=data['total_points'],
            cost_in_footy_coins=data.get('cost_in_footy_coins', 0),
            is_active=True,
            expires_at=expires_at
        )
        quiz.save()
        
        return jsonify(format_success(
            data=quiz.to_dict(),
            message='Quiz created successfully'
        )), 201
    
    except Exception as e:
        return jsonify(format_error(str(e))), 500


@admin_bp.route('/quizzes/bulk', methods=['POST'])
@admin_required
def create_quiz_bulk():
    """Create a new quiz with all questions and options (Admin only)"""
    try:
        data = request.get_json()
        
        # Validate required fields
        required = ['name', 'total_questions', 'time_limit_seconds', 'total_points']
        for field in required:
            if field not in data:
                return jsonify(format_error(f'Missing: {field}')), 400
        
        # Set expiration to 24 hours from now by default
        expires_at = datetime.utcnow() + timedelta(hours=24)
        if 'expires_at' in data and data['expires_at']:
            # Handle ISO timestamp format coming from JS
            expires_at_str = data['expires_at'].replace('Z', '+00:00')
            expires_at = datetime.fromisoformat(expires_at_str)
        
        scheduled_for = None
        if 'scheduled_for' in data and data['scheduled_for']:
            scheduled_for_str = data['scheduled_for'].replace('Z', '+00:00')
            scheduled_for = datetime.fromisoformat(scheduled_for_str)

        quiz = Quiz(
            id=generate_id(),
            name=data['name'],
            description=data.get('description'),
            quiz_type=data.get('quiz_type', 'multiple_choice'),
            total_questions=data['total_questions'],
            time_limit_seconds=data['time_limit_seconds'],
            points_per_question=data.get('points_per_question', 10),
            total_points=data['total_points'],
            cost_in_footy_coins=data.get('cost_in_footy_coins', 0),
            is_active=True,
            expires_at=expires_at,
            scheduled_for=scheduled_for,
            notification_sent=False if scheduled_for else True
        )

        questions_data = data.get('questions', [])
        for q_idx, q_data in enumerate(questions_data):
            q_type = q_data.get('question_type') or data.get('quiz_type', 'multiple_choice')
            question = Question(
                id=generate_id(),
                question_text=q_data.get('question_text', ''),
                question_type=q_type,
                image_url=q_data.get('image_url'),
                correct_answer_text=q_data.get('correct_answer_text'),
                order=q_idx,
            )

            options_data = q_data.get('options', [])
            correct_option_index = q_data.get('correct_option_index', 0)

            for o_idx, o_text in enumerate(options_data):
                option = Option(
                    id=generate_id(),
                    option_text=o_text,
                    order=o_idx,
                )
                question.options.append(option)
                
                if o_idx == correct_option_index:
                    question.correct_option_id = option.id
            
            quiz.questions.append(question)
            
        quiz.save()
        
        # Send telegram notification to users via bot if not scheduled
        if not scheduled_for:
            try:
                telegram_service = get_telegram_service()
                telegram_service.send_quiz_notification(
                    quiz.name,
                    quiz.description,
                    quiz.total_questions,
                    quiz.total_points,
                    async_send=True,
                    expires_at=quiz.expires_at,
                )
            except Exception as e:
                print(f"[ADMIN] Error sending quiz notification to users: {str(e)}")
        
        return jsonify(format_success(
            data=quiz.to_dict(),
            message='Quiz created in bulk successfully'
        )), 201
    
    except Exception as e:
        return jsonify(format_error(str(e))), 500


@admin_bp.route('/quizzes/<quiz_id>/questions', methods=['POST'])
@admin_required
def add_question(quiz_id):
    """Add question to quiz"""
    try:
        quiz = Quiz.objects(id=quiz_id).first()
        if not quiz:
            return jsonify(format_error('Quiz not found')), 404
        
        data = request.get_json()
        
        question = Question(
            id=generate_id(),
            question_text=data.get('question_text', ''),
            question_type=data.get('question_type', 'multiple_choice'),
            image_url=data.get('image_url'),
            correct_answer_text=data.get('correct_answer_text'),
            order=data.get('order', 0),
        )
        
        quiz.questions.append(question)
        quiz.save()
        
        return jsonify(format_success(
            data={'id': question.id},
            message='Question added'
        )), 201
    
    except Exception as e:
        return jsonify(format_error(str(e))), 500


@admin_bp.route('/questions/<question_id>/options', methods=['POST'])
@admin_required
def add_option(question_id):
    """Add option to question"""
    try:
        # Find quiz containing the question
        quiz = Quiz.objects(__raw__={'questions.id': question_id}).first()
        if not quiz:
            return jsonify(format_error('Question not found')), 404
        
        # Find the question within the quiz
        question = None
        for q in quiz.questions:
            if q.id == question_id:
                question = q
                break
        
        if not question:
            return jsonify(format_error('Question not found')), 404
        
        data = request.get_json()
        
        option = Option(
            id=generate_id(),
            option_text=data.get('option_text'),
            order=data.get('order', 0),
        )
        
        question.options.append(option)
        
        # If this is marked as correct, update question
        if data.get('is_correct', False):
            question.correct_option_id = option.id
        
        quiz.save()
        
        return jsonify(format_success(
            data={'id': option.id},
            message='Option added'
        )), 201
    
    except Exception as e:
        return jsonify(format_error(str(e))), 500


@admin_bp.route('/quizzes/<quiz_id>', methods=['PUT'])
@admin_required
def update_quiz(quiz_id):
    """Update quiz"""
    try:
        quiz = Quiz.objects(id=quiz_id).first()
        if not quiz:
            return jsonify(format_error('Quiz not found')), 404
        
        data = request.get_json()
        
        if 'name' in data:
            quiz.name = data['name']
        if 'description' in data:
            quiz.description = data['description']
        if 'cost_in_footy_coins' in data:
            quiz.cost_in_footy_coins = data['cost_in_footy_coins']
        if 'is_active' in data:
            quiz.is_active = data['is_active']
        if 'expires_at' in data:
            quiz.expires_at = datetime.fromisoformat(data['expires_at'])
        
        quiz.save()
        
        return jsonify(format_success(
            data=quiz.to_dict(),
            message='Quiz updated'
        )), 200
    
    except Exception as e:
        return jsonify(format_error(str(e))), 500


@admin_bp.route('/quizzes/<quiz_id>', methods=['DELETE'])
@admin_required
def delete_quiz(quiz_id):
    """Delete quiz"""
    try:
        quiz = Quiz.objects(id=quiz_id).first()
        if not quiz:
            return jsonify(format_error('Quiz not found')), 404
        
        quiz.delete()
        
        return jsonify(format_success(message='Quiz deleted')), 200
    
    except Exception as e:
        return jsonify(format_error(str(e))), 500


@admin_bp.route('/tasks', methods=['GET'])
@admin_required
def get_all_tasks():
    """Get all footy coin tasks"""
    try:
        tasks = FootyCoinTask.objects()
        return jsonify(format_success(
            data=[task.to_dict() for task in tasks]
        )), 200
    
    except Exception as e:
        return jsonify(format_error(str(e))), 500


@admin_bp.route('/tasks/<task_id>', methods=['PUT'])
@admin_required
def update_task(task_id):
    """Update footy coin task"""
    try:
        task = FootyCoinTask.objects(id=task_id).first()
        if not task:
            return jsonify(format_error('Task not found')), 404
        
        data = request.get_json()
        
        if 'title' in data:
            task.title = data['title']
        if 'reward_coins' in data:
            task.reward_coins = data['reward_coins']
        if 'is_active' in data:
            task.is_active = data['is_active']
        
        task.save()
        
        return jsonify(format_success(
            data=task.to_dict(),
            message='Task updated'
        )), 200
    
    except Exception as e:
        return jsonify(format_error(str(e))), 500


@admin_bp.route('/quizzes/<quiz_id>/notify', methods=['POST'])
@admin_required
def notify_quiz(quiz_id):
    """Manually send quiz notification to users via bot (Admin only)"""
    try:
        quiz = Quiz.objects(id=quiz_id).first()
        if not quiz:
            return jsonify(format_error('Quiz not found')), 404

        telegram_service = get_telegram_service()
        telegram_service.send_quiz_notification(
            quiz.name,
            quiz.description or '',
            quiz.total_questions,
            quiz.total_points,
            async_send=True,
            expires_at=quiz.expires_at,
        )

        quiz.notification_sent = True
        quiz.save()

        return jsonify(format_success(
            message='Quiz notification is being sent to users via the bot'
        )), 200
    except Exception as e:
        return jsonify(format_error(str(e))), 500
