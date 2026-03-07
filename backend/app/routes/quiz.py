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
    """Get all active quizzes (not expired)"""
    try:
        user_id = get_jwt_identity() 
        now = datetime.utcnow()
        
        # Get all quizzes that expire in the future (today's quizzes)
        quizzes = list(Quiz.objects(expires_at__gt=now, is_active=True).order_by('-created_at'))
        
        if not quizzes:
            return jsonify(format_success(data=[], message='No quizzes available')), 200
        
        quizzes_data = []
        for quiz in quizzes:
            # Check if this user has already submitted a response for this quiz
            already_played = QuizResponse.objects(
                user_id=user_id, quiz_id=quiz.id
            ).first() is not None
            
            quizzes_data.append({
                'id': quiz.id,
                'name': quiz.name,
                'description': quiz.description,
                'total_questions': quiz.total_questions,
                'time_limit_seconds': quiz.time_limit_seconds,
                'points_per_question': quiz.points_per_question,
                'total_points': quiz.total_points,
                'cost_in_footy_coins': quiz.cost_in_footy_coins,
                'expires_at': quiz.expires_at.isoformat() + 'Z',
                'created_at': quiz.created_at.isoformat() + 'Z',
                'already_played': already_played,
            })
        
        return jsonify(format_success(data=quizzes_data)), 200
    
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
        
        print(f"[DEBUG submit_quiz] Received answers: {answers}")
        print(f"[DEBUG submit_quiz] Received time_taken_seconds: {time_taken_seconds}")
        
        # ── Validate answers against quiz questions ────────────────────────────
        quiz_answers = []
        correct_count = 0
        
        for answer_data in answers:
            question_id = answer_data.get('question_id')
            selected_option_id = answer_data.get('selected_option_id')
            
            if not question_id or not selected_option_id:
                return jsonify(format_error('Missing question_id or selected_option_id')), 400
            
            # Find question in quiz
            question = None
            for q in quiz.questions:
                if q.id == question_id:
                    question = q
                    break
            
            if not question:
                print(f"[DEBUG] Question {question_id} not found in quiz {quiz_id}")
                print(f"[DEBUG] Available questions: {[q.id for q in quiz.questions]}")
                return jsonify(format_error(f'Question not found in this quiz')), 400
            
            # Validate the answer
            is_correct = (selected_option_id == question.correct_option_id)
            print(f"[DEBUG] Question {question_id}: selected={selected_option_id}, correct={question.correct_option_id}, is_correct={is_correct}")
            if is_correct:
                correct_count += 1
            
            quiz_answers.append(QuizAnswer(
                question_id=question_id,
                selected_option_id=selected_option_id,
                is_correct=is_correct
            ))
        
        total_count = len(answers)
        print(f"[DEBUG] Total answers: {total_count}, Correct: {correct_count}")
        accuracy = calculate_quiz_accuracy(correct_count, total_count)
        
        # Calculate points
        points_per_question = quiz.total_points / quiz.total_questions
        points_earned = int(correct_count * points_per_question)
        print(f"[DEBUG] Points: {points_per_question} per question, {points_earned} total")
        
        
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
        
        # ── Add points to active leagues ──────────────────────────────────────
        # Find all active leagues the user is in
        from app.models import UserLeague, League
        from app.utils import update_league_rankings
        user_leagues = UserLeague.objects(user_id=user_id)
        now = datetime.utcnow()
        
        updated_leagues = set()
        for user_league in user_leagues:
            league = League.objects(id=user_league.league_id).first()
            
            # Only add points if league is active (end_date in the future)
            if league and league.end_date > now:
                user_league.points += points_earned
                user_league.save()
                updated_leagues.add(league.id)
                print(f"[DEBUG] Added {points_earned} points to user {user_id} in league {league.id}")
            else:
                print(f"[DEBUG] Skipped league {user_league.league_id} - inactive or not found")
        
        # ── Update rankings for each affected league ─────────────────────────────
        for league_id in updated_leagues:
            update_league_rankings(league_id)
        
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

        result_dict = response.to_dict()
        print(f"[DEBUG] Returning result: {result_dict}")
        
        return jsonify(format_success(
            data=result_dict,
            message='Quiz submitted successfully'
        )), 200
    
    except Exception as e:
        return jsonify(format_error(f'Error submitting quiz: {str(e)}')), 500
