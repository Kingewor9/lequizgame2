from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import Quiz, Question, Option, FootyCoinTask, User
from app.utils import generate_id, format_success, format_error
from app.services.telegram_service import get_telegram_service
from datetime import datetime, timedelta
from functools import wraps

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

        questions_data = data.get('questions', [])
        for q_idx, q_data in enumerate(questions_data):
            question = Question(
                id=generate_id(),
                question_text=q_data.get('question_text'),
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
        
        # Send telegram notification to channel
        try:
            telegram_service = get_telegram_service()
            telegram_service.send_quiz_notification(
                quiz.name,
                quiz.description,
                quiz.total_questions,
                quiz.total_points
            )
        except Exception as e:
            print(f"[ADMIN] Error sending quiz notification to channel: {str(e)}")
        
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
            question_text=data.get('question_text'),
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
