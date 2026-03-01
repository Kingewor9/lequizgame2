from flask import Blueprint, request, jsonify
from app.models import Quiz, Question, Option, FootyCoinTask
from app.utils import generate_id, format_success, format_error
from datetime import datetime, timedelta

admin_bp = Blueprint('admin', __name__, url_prefix='/api/admin')

# Note: In production, add proper authentication middleware to verify admin access


@admin_bp.route('/quizzes', methods=['POST'])
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


@admin_bp.route('/quizzes/<quiz_id>/questions', methods=['POST'])
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
