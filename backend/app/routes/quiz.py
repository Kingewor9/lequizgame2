from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import User, Quiz, QuizResponse, QuizAnswer, FootyCoinTransaction
from app.utils import generate_id, format_success, format_error, calculate_quiz_accuracy
from datetime import datetime

quiz_bp = Blueprint('quiz', __name__, url_prefix='/api/quizzes')

def update_global_rankings():
    """
    Recalculate global_rank and global_total_players for all users.
    Called after every quiz submission so the homepage always shows live data.
    """
    try:
        all_users = list(User.objects().order_by('-overall_score'))
        total = len(all_users)
        for rank, u in enumerate(all_users, 1):
            u.global_rank = rank
            u.global_total_players = total
            u.save()
    except Exception as e:
        print(f'Error updating global rankings: {str(e)}')

@quiz_bp.route('/today', methods=['GET'])
@jwt_required()
def get_today_quiz():
    """Get today's quiz"""
    try:
        user_id = get_jwt_identity() 
        now = datetime.utcnow()
        
        # Get quiz that expires in the future (today's quiz)
        quiz = Quiz.objects(expires_at__gt=now, is_active=True).first()
        
        print(f"[DEBUG] get_today_quiz: now={now}, quiz_count={Quiz.objects(is_active=True).count()}, found_quiz={quiz.id if quiz else None}")
        
        if not quiz:
            return jsonify(format_success(data=None, message='No quiz available')), 200
        
        # Check if this user has already submitted a response for this quiz
        already_played = QuizResponse.objects(
            user_id=user_id, quiz_id=quiz.id
        ).first() is not None

        result = {
            'id': quiz.id,
            'name': quiz.name,
            'description': quiz.description,
            'total_questions': quiz.total_questions,
            'time_limit_seconds': quiz.time_limit_seconds,
            'points_per_question': quiz.points_per_question,
            'total_points': quiz.total_points,
            'cost_in_footy_coins': quiz.cost_in_footy_coins,
            'expires_at': quiz.expires_at.isoformat(),
            'created_at': quiz.created_at.isoformat(),
            'already_played': already_played,
            'is_active': quiz.is_active,
        }
        print(f"[DEBUG] Returning quiz data: {result}")
        return jsonify(format_success(data=result)), 200
    
    except Exception as e:
        return jsonify(format_error(f'Error fetching quiz: {str(e)}')), 500


@quiz_bp.route('/<quiz_id>', methods=['GET'])
@jwt_required()
def get_quiz(quiz_id):
    """Get full quiz with questions"""
    try:
        quiz = Quiz.objects(id=quiz_id).first()
        
        if not quiz:
            return jsonify(format_error('Quiz not found')), 404
        
        return jsonify(format_success(data=quiz.to_dict())), 200
    
    except Exception as e:
        return jsonify(format_error(f'Error fetching quiz: {str(e)}')), 500


@quiz_bp.route('/<quiz_id>/submit', methods=['POST'])
@jwt_required()
def submit_quiz(quiz_id):
    """Submit quiz answers"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        
        quiz = Quiz.objects(id=quiz_id).first()
        if not quiz:
            return jsonify(format_error('Quiz not found')), 404
        
        user = User.objects(id=user_id).first()
        if not user:
            return jsonify(format_error('User not found')), 404

        # ── Block replay ──────────────────────────────────────────────────────
        already_played = QuizResponse.objects(user_id=user_id, quiz_id=quiz_id).first()
        if already_played:
            return jsonify(format_error(
                'You have already completed this quiz. Come back tomorrow!'
            )), 400
        
        answers = data.get('answers', [])
        time_taken_seconds = data.get('time_taken_seconds', 0)
        
        # Calculate results
        correct_count = sum(1 for a in answers if a.get('is_correct'))
        total_count = len(answers)
        accuracy = calculate_quiz_accuracy(correct_count, total_count)
        
        # Calculate points
        points_per_question = quiz.total_points / quiz.total_questions
        points_earned = int(correct_count * points_per_question)
        
        # Create answer objects
        quiz_answers = [
            QuizAnswer(
                question_id=a.get('question_id'),
                selected_option_id=a.get('selected_option_id'),
                is_correct=a.get('is_correct')
            )
            for a in answers
        ]
        
        # Save quiz response
        response = QuizResponse(
            id=generate_id(),
            user_id=user_id,
            quiz_id=quiz_id,
            answers=quiz_answers,
            total_questions=total_count,
            correct_answers=correct_count,
            incorrect_answers=total_count - correct_count,
            points_earned=points_earned,
            accuracy_rate=accuracy,
            time_taken_seconds=time_taken_seconds
        )
        response.save()
        
        # Update user stats
        user.overall_score += points_earned
        user.save()
        
        # Add footy coins transaction (reward)
        transaction = FootyCoinTransaction(
            id=generate_id(),
            user_id=user_id,
            type='earned',
            amount=points_earned,
            reason=f'Quiz: {quiz.name}'
        )
        transaction.save()

        # ── Recalculate ALL users' global ranks so homepage shows live data ──
        update_global_rankings()

        
        return jsonify(format_success(
            data=response.to_dict(),
            message='Quiz submitted successfully'
        )), 200
    
    except Exception as e:
        return jsonify(format_error(f'Error submitting quiz: {str(e)}')), 500
