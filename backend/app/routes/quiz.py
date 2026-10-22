from flask import Blueprint, request, jsonify, current_app, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from pymongo import UpdateOne
from app.models import (
    User,
    Quiz,
    QuizAttempt,
    QuizResponse,
    QuizAnswer,
    FootyCoinTransaction,
    Tournament,
    TournamentFixture,
    TournamentRegistration,
    TournamentSubmission,
)
from app.utils import (
    generate_id,
    format_success,
    format_error,
    calculate_quiz_accuracy,
)
from datetime import datetime

quiz_bp = Blueprint('quiz', __name__, url_prefix='/api/quizzes')


def _tournament_quiz_available(quiz, user_id):
    if getattr(quiz, 'destination', 'game') != 'tournament':
        return None, None, None

    tournament = Tournament.objects(id=quiz.tournament_id).first()
    if not tournament:
        return None, None, 'Tournament not found'

    from app.services.tournament_service import sync_tournament

    sync_tournament(tournament)
    tournament.reload()
    registration = TournamentRegistration.objects(
        tournament_id=tournament.id,
        user_id=user_id,
    ).first()
    if not registration:
        return None, None, 'You are not registered for this tournament'
    now = datetime.utcnow()
    if tournament.status != 'active':
        return None, None, 'Tournament quiz is not currently available'

    current_gameweek = int((now - tournament.start_at).total_seconds() // 86400) + 1
    if current_gameweek != quiz.tournament_gameweek:
        return None, None, 'This tournament quiz is not for the current gameweek'
    if quiz.scheduled_for and quiz.scheduled_for > now:
        return None, None, 'Tournament quiz has not started yet'
    if not quiz.is_active or quiz.expires_at <= now:
        return None, None, 'Tournament quiz is no longer available'

    fixture = TournamentFixture.objects(
        tournament_id=tournament.id,
        gameweek=current_gameweek,
        status='scheduled',
        **(
            {'player_two_id__ne': None}
            if tournament.tournament_type == 'group_knockout'
            else {}
        ),
        __raw__={
            '$or': [
                {'player_one_id': user_id},
                {'player_two_id': user_id},
            ],
        },
    ).first()
    if not fixture:
        return None, None, 'No fixture is scheduled for you in this gameweek'
    return tournament, fixture, None


def update_global_rankings():
    """Refresh all cached player ranks using a single batched database write."""
    try:
        users = User.objects.only(
            'id',
            'overall_score',
            'global_rank',
            'prev_global_rank',
        ).order_by('-overall_score')
        total = users.count()
        updates = []

        for rank, user in enumerate(users, 1):
            values = {
                'global_rank': rank,
                'global_total_players': total,
            }
            previous_rank = getattr(user, 'global_rank', 0) or 0
            if previous_rank > 0 and previous_rank != rank:
                values['prev_global_rank'] = previous_rank
            elif previous_rank == 0:
                values['prev_global_rank'] = rank

            updates.append(UpdateOne({'_id': user.id}, {'$set': values}))

        if updates:
            User._get_collection().bulk_write(updates, ordered=False)
    except Exception:
        current_app.logger.exception('Could not update global quiz rankings')


def _leaderboard_booster_status(user, quiz, response, now=None):
    now = now or datetime.utcnow()
    today = now.date().isoformat()
    uses_today = (
        len(getattr(user, 'leaderboard_booster_quiz_ids', []) or [])
        if getattr(user, 'leaderboard_booster_day', '') == today
        else 0
    )
    bonus = getattr(response, 'leaderboard_bonus', 0) or 0
    return {
        'available': (
            getattr(quiz, 'destination', 'game') != 'tournament'
            and response.points_earned > 0
            and bonus == 0
            and uses_today < 3
        ),
        'uses_remaining': max(0, 3 - uses_today),
        'bonus_points': bonus,
    }


@quiz_bp.route('/today', methods=['GET'])
@jwt_required()
def get_today_quiz():
    """Get all active quizzes (not expired)"""
    try:
        user_id = get_jwt_identity() 
        now = datetime.utcnow()
        
        # Get all quizzes that expire in the future (today's quizzes)
        quizzes = [
            quiz for quiz in Quiz.objects(expires_at__gt=now, is_active=True).order_by('-created_at')
            if getattr(quiz, 'destination', 'game') != 'tournament'
        ]
        
        if not quizzes:
            return jsonify(format_success(data=[], message='No quizzes available')), 200
        
        quizzes_data = []
        for quiz in quizzes:
            # Check if this user has already submitted a response for this quiz
            already_played = QuizResponse.objects(user_id=user_id, quiz_id=quiz.id).first() is not None
            
            quizzes_data.append({
                'id': quiz.id,
                'name': quiz.name,
                'description': quiz.description,
                'total_questions': quiz.total_questions,
                'time_limit_seconds': quiz.time_limit_seconds,
                'points_per_question': quiz.points_per_question,
                'total_points': quiz.total_points,
                'cost_in_footy_coins': quiz.cost_in_footy_coins,
                'destination': 'game',
                'quiz_type': getattr(quiz, 'quiz_type', 'multiple_choice') or 'multiple_choice',
                'expires_at': quiz.expires_at.isoformat() + 'Z',
                'scheduled_for': (quiz.scheduled_for.isoformat() + 'Z') if getattr(quiz, 'scheduled_for', None) else None,
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

        if getattr(quiz, 'destination', 'game') == 'tournament':
            _, _, error = _tournament_quiz_available(
                quiz,
                get_jwt_identity(),
            )
            if error:
                return jsonify(format_error(error)), 403
        
        return jsonify(format_success(data=quiz.to_dict())), 200
    
    except Exception as e:
        return jsonify(format_error(f'Error fetching quiz: {str(e)}')), 500


@quiz_bp.route('/<quiz_id>/start', methods=['POST'])
@jwt_required()
def start_quiz(quiz_id):
    """Record that the authenticated player has started a quiz."""
    try:
        user_id = get_jwt_identity()
        quiz = Quiz.objects(id=quiz_id, is_active=True).first()
        if not quiz or quiz.expires_at <= datetime.utcnow():
            return jsonify(format_error('Quiz is not currently available')), 404
        if quiz.scheduled_for and quiz.scheduled_for > datetime.utcnow():
            return jsonify(format_error('Quiz is not currently available')), 404

        if getattr(quiz, 'destination', 'game') == 'tournament':
            _, fixture, error = _tournament_quiz_available(quiz, user_id)
            if error:
                return jsonify(format_error(error)), 403
            if fixture.status != 'scheduled':
                return jsonify(format_error('Your tournament fixture is already complete')), 409
            already_played = TournamentSubmission.objects(
                user_id=user_id,
                quiz_id=quiz_id,
            ).first()
        else:
            already_played = QuizResponse.objects(user_id=user_id, quiz_id=quiz_id).first()
        if already_played:
            return jsonify(format_error('You have already completed this quiz')), 409

        QuizAttempt.objects(user_id=user_id, quiz_id=quiz_id).update_one(
            upsert=True,
            set_on_insert__id=generate_id(),
            set_on_insert__started_at=datetime.utcnow(),
        )
        return jsonify(format_success(message='Quiz start recorded')), 200

    except Exception as e:
        current_app.logger.exception('Could not record quiz start')
        return jsonify(format_error(f'Could not record quiz start: {str(e)}')), 500


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

        is_tournament_quiz = getattr(quiz, 'destination', 'game') == 'tournament'
        existing_model = TournamentSubmission if is_tournament_quiz else QuizResponse
        existing_response = existing_model.objects(
            user_id=user_id,
            quiz_id=quiz_id,
        ).first()
        if existing_response:
            result = existing_response.to_dict()
            if not is_tournament_quiz:
                user = User.objects(id=user_id).first()
                if user:
                    result['leaderboard_booster'] = _leaderboard_booster_status(
                        user, quiz, existing_response
                    )
            return jsonify(format_success(
                data=result,
                message='Quiz submitted successfully',
            )), 200

        tournament = None
        fixture = None
        if is_tournament_quiz:
            tournament, fixture, error = _tournament_quiz_available(quiz, user_id)
            if error:
                return jsonify(format_error(error)), 403
            if fixture.status != 'scheduled':
                return jsonify(format_error('Your tournament fixture is already complete')), 409
        
        user = User.objects(id=user_id).first()
        if not user:
            return jsonify(format_error('User not found')), 404

        # Return the persisted result when a client retries after a lost response.
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
            answer_text = answer_data.get('answer_text')
            
            if not question_id:
                return jsonify(format_error('Missing question_id')), 400
            
            # Find question in quiz
            question = None
            for q in quiz.questions:
                if q.id == question_id:
                    question = q
                    break
            
            if not question:
                print(f"[DEBUG] Question {question_id} not found in quiz {quiz_id}")
                return jsonify(format_error(f'Question not found in this quiz')), 400
            
            q_type = getattr(question, 'question_type', 'multiple_choice') or 'multiple_choice'
            
            if q_type == 'image_text':
                # Text answer matching for image quiz
                raw_user_answer = (answer_text if answer_text is not None else (selected_option_id or '')).strip()
                raw_correct = getattr(question, 'correct_answer_text', '') or ''
                
                # Support comma/pipe separated acceptable aliases
                aliases = [a.strip().lower() for a in raw_correct.replace('|', ',').split(',') if a.strip()]
                user_norm = raw_user_answer.lower()
                
                is_correct = False
                if user_norm and aliases:
                    is_correct = any(user_norm == a for a in aliases)
                elif user_norm and not aliases:
                    is_correct = (user_norm == raw_correct.strip().lower())
                
                print(f"[DEBUG] Image Question {question_id}: user='{raw_user_answer}', correct='{raw_correct}', is_correct={is_correct}")
                if is_correct:
                    correct_count += 1
                
                quiz_answers.append(QuizAnswer(
                    question_id=question_id,
                    selected_option_id=None,
                    answer_text=raw_user_answer,
                    is_correct=is_correct
                ))
            else:
                # Multiple choice validation
                if not selected_option_id:
                    return jsonify(format_error('Missing selected_option_id for multiple choice question')), 400
                is_correct = (selected_option_id == question.correct_option_id)
                print(f"[DEBUG] MC Question {question_id}: selected={selected_option_id}, correct={question.correct_option_id}, is_correct={is_correct}")
                if is_correct:
                    correct_count += 1
                
                quiz_answers.append(QuizAnswer(
                    question_id=question_id,
                    selected_option_id=selected_option_id,
                    answer_text=None,
                    is_correct=is_correct
                ))
        
        total_count = len(answers)
        print(f"[DEBUG] Total answers: {total_count}, Correct: {correct_count}")
        accuracy = calculate_quiz_accuracy(correct_count, total_count)
        
        # Calculate points
        points_per_question = quiz.total_points / quiz.total_questions
        points_earned = int(correct_count * points_per_question)
        print(f"[DEBUG] Points: {points_per_question} per question, {points_earned} total")

        if is_tournament_quiz and tournament:
            submission = TournamentSubmission(
                id=generate_id(),
                user_id=user_id,
                tournament_id=tournament.id,
                quiz_id=quiz.id,
                gameweek=quiz.tournament_gameweek,
                answers=quiz_answers,
                total_questions=total_count,
                correct_answers=correct_count,
                incorrect_answers=total_count - correct_count,
                points_earned=points_earned,
                accuracy_rate=accuracy,
                time_taken_seconds=time_taken_seconds,
            )
            try:
                submission.save()
            except Exception:
                current_app.logger.exception('Could not save tournament quiz result')
                return jsonify(format_error('Could not save tournament quiz result')), 500

            from app.services.tournament_service import (
                notify_opponent_score,
                sync_tournament,
            )

            notify_opponent_score(submission)
            sync_tournament(tournament)
            return jsonify(format_success(
                data=submission.to_dict(),
                message='Tournament quiz submitted successfully',
            )), 201
        
        
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
        QuizAttempt.objects(user_id=user_id, quiz_id=quiz_id).update_one(
            upsert=True,
            set_on_insert__id=generate_id(),
            set__completed_at=datetime.utcnow(),
            set_on_insert__started_at=datetime.utcnow(),
        )
        
        # Save career milestones crossed by this score increase.
        from app.models import MilestoneAchievement
        from app.utils import CAREER_MILESTONES
        previous_score = user.overall_score
        user.overall_score += points_earned
        user.save()
        for milestone_title, milestone_points in CAREER_MILESTONES:
            if previous_score < milestone_points <= user.overall_score:
                MilestoneAchievement(
                    user_id=user.id,
                    title=milestone_title,
                    points=milestone_points,
                ).save()
        
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

        # Batch cached rank updates to avoid one database write per user.
        update_global_rankings()

        if points_earned > 0:
            try:
                from app.services.battle_service import (
                    notify_battle_quiz_score,
                )

                notify_battle_quiz_score(response)
            except Exception:
                current_app.logger.exception(
                    'Could not send 1v1 battle score notification for quiz response %s',
                    response.id,
                )

        result_dict = response.to_dict()
        result_dict['leaderboard_booster'] = _leaderboard_booster_status(
            user, quiz, response
        )
        print(f"[DEBUG] Returning result: {result_dict}")
        
        return jsonify(format_success(
            data=result_dict,
            message='Quiz submitted successfully'
        )), 200
    
    except Exception as e:
        current_app.logger.exception('Error submitting quiz %s', quiz_id)
        return jsonify(format_error(f'Error submitting quiz: {str(e)}')), 500


@quiz_bp.route('/<quiz_id>/leaderboard-booster', methods=['POST'])
@jwt_required()
def use_leaderboard_booster(quiz_id):
    """Double a completed main-game quiz's contribution to the global leaderboard."""
    try:
        user_id = get_jwt_identity()
        quiz = Quiz.objects(id=quiz_id).first()
        if not quiz:
            return jsonify(format_error('Quiz not found')), 404
        if getattr(quiz, 'destination', 'game') == 'tournament':
            return jsonify(format_error('The leaderboard booster is not available for tournament quizzes')), 400

        response = QuizResponse.objects(user_id=user_id, quiz_id=quiz_id).first()
        if not response:
            return jsonify(format_error('Complete this quiz before using the leaderboard booster')), 409
        if response.points_earned <= 0:
            return jsonify(format_error('A score greater than zero is required to use the leaderboard booster')), 400

        user = User.objects(id=user_id).first()
        if not user:
            return jsonify(format_error('User not found')), 404

        if getattr(response, 'leaderboard_bonus', 0):
            return jsonify(format_success(
                data={
                    'leaderboard_bonus': response.leaderboard_bonus,
                    'leaderboard_score': user.overall_score,
                    'leaderboard_booster': _leaderboard_booster_status(
                        user, quiz, response
                    ),
                },
                message='Leaderboard score already doubled for this quiz',
            )), 200

        now = datetime.utcnow()
        today = now.date().isoformat()
        user_collection = User._get_collection()
        reservation = user_collection.update_one(
            {
                '_id': user_id,
                '$or': [
                    {
                        'leaderboard_booster_day': today,
                        'leaderboard_booster_quiz_ids': {'$ne': quiz_id},
                        '$expr': {
                            '$lt': [
                                {
                                    '$size': {
                                        '$ifNull': ['$leaderboard_booster_quiz_ids', []]
                                    }
                                },
                                3,
                            ]
                        },
                    },
                    {'leaderboard_booster_day': {'$ne': today}},
                ],
            },
            [
                {
                    '$set': {
                        'leaderboard_booster_day': today,
                        'leaderboard_booster_quiz_ids': {
                            '$cond': [
                                {'$eq': ['$leaderboard_booster_day', today]},
                                {
                                    '$concatArrays': [
                                        {
                                            '$ifNull': [
                                                '$leaderboard_booster_quiz_ids',
                                                [],
                                            ]
                                        },
                                        [quiz_id],
                                    ]
                                },
                                [quiz_id],
                            ]
                        },
                    }
                }
            ],
        )
        if reservation.modified_count != 1:
            return jsonify(format_error('You have used all 3 leaderboard boosters for today')), 429

        bonus = response.points_earned
        response_updated = False
        try:
            response_updated = QuizResponse.objects(
                id=response.id,
                user_id=user_id,
                leaderboard_bonus=0,
            ).update_one(
                set__leaderboard_bonus=bonus,
                set__leaderboard_boosted_at=now,
            )
            if not response_updated:
                user_collection.update_one(
                    {'_id': user_id, 'leaderboard_booster_day': today},
                    {'$pull': {'leaderboard_booster_quiz_ids': quiz_id}},
                )
                current_response = QuizResponse.objects(id=response.id).first()
                if current_response and getattr(current_response, 'leaderboard_bonus', 0):
                    return jsonify(format_success(
                        data={
                            'leaderboard_bonus': current_response.leaderboard_bonus,
                            'leaderboard_score': user.overall_score,
                            'leaderboard_booster': _leaderboard_booster_status(
                                user, quiz, current_response
                            ),
                        },
                        message='Leaderboard score already doubled for this quiz',
                    )), 200
                return jsonify(format_error('Could not apply the leaderboard booster. Please try again.')), 409

            score_updated = User.objects(id=user_id).update_one(inc__overall_score=bonus)
            if not score_updated:
                QuizResponse.objects(
                    id=response.id,
                    user_id=user_id,
                    leaderboard_bonus=bonus,
                ).update_one(
                    set__leaderboard_bonus=0,
                    unset__leaderboard_boosted_at=1,
                )
                user_collection.update_one(
                    {'_id': user_id, 'leaderboard_booster_day': today},
                    {'$pull': {'leaderboard_booster_quiz_ids': quiz_id}},
                )
                return jsonify(format_error('Could not update the leaderboard score. Please try again.')), 500
        except Exception:
            if response_updated:
                QuizResponse.objects(
                    id=response.id,
                    user_id=user_id,
                    leaderboard_bonus=bonus,
                ).update_one(
                    set__leaderboard_bonus=0,
                    unset__leaderboard_boosted_at=1,
                )
            user_collection.update_one(
                {'_id': user_id, 'leaderboard_booster_day': today},
                {'$pull': {'leaderboard_booster_quiz_ids': quiz_id}},
            )
            raise

        update_global_rankings()
        user.reload()
        response.leaderboard_bonus = bonus
        response.leaderboard_boosted_at = now
        return jsonify(format_success(
            data={
                'leaderboard_bonus': bonus,
                'leaderboard_score': user.overall_score,
                'leaderboard_booster': _leaderboard_booster_status(
                    user, quiz, response, now
                ),
            },
            message='Leaderboard score doubled successfully',
        )), 200

    except Exception as e:
        current_app.logger.exception('Error applying leaderboard booster for quiz %s', quiz_id)
        return jsonify(format_error(f'Error applying leaderboard booster: {str(e)}')), 500
