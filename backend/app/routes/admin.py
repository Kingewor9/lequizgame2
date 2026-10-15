from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import (
    AppLaunch,
    League,
    Quiz,
    QuizAttempt,
    QuizResponse,
    Question,
    Option,
    FootyCoinTask,
    User,
    UserLeague,
    Tournament,
    TournamentFixture,
    TournamentRegistration,
    TournamentSubmission,
)
from app.utils import generate_id, format_success, format_error
from app.services.telegram_service import get_telegram_service
from app.services.tournament_service import schedule_tournament_restart
from datetime import datetime, timedelta, timezone
from functools import wraps
from urllib.parse import urlparse

admin_bp = Blueprint('admin', __name__, url_prefix='/api/admin')


def _parse_utc(value):
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo:
        return parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def _quiz_destination(data, scheduled_for):
    destination = data.get('destination', 'game')
    tournament_id = data.get('tournament_id')
    if destination == 'game':
        if tournament_id:
            return None, None, 'A standard game quiz cannot target a tournament.'
        return 'game', None, None
    if destination != 'tournament':
        return None, None, 'Quiz destination must be game or tournament.'
    if not tournament_id:
        return None, None, 'Choose a tournament for this quiz.'

    tournament = Tournament.objects(id=tournament_id).first()
    if not tournament:
        return None, None, 'Tournament not found.'
    if tournament.tournament_type != 'league' or tournament.status in ('draft', 'cancelled', 'completed'):
        return None, None, 'Tournament quizzes are only available for an active 1v1 league.'

    quiz_start = scheduled_for or datetime.utcnow()
    if quiz_start < tournament.start_at:
        return None, None, 'Schedule this quiz at or after the tournament start date.'
    gameweek = int((quiz_start - tournament.start_at).total_seconds() // 86400) + 1
    max_gameweeks = tournament.total_gameweeks if tournament.status == 'active' else 38
    if gameweek > max_gameweeks:
        return None, None, 'The quiz date is outside this tournament season.'
    duplicate = Quiz.objects(
        destination='tournament',
        tournament_id=tournament.id,
        tournament_gameweek=gameweek,
        is_active=True,
    ).first()
    if duplicate:
        return None, None, f'A tournament quiz is already scheduled for GW{gameweek}.'
    return 'tournament', (tournament.id, gameweek), None

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


@admin_bp.route('/tournaments', methods=['GET'])
@admin_required
def get_tournaments():
    try:
        tournaments = Tournament.objects().order_by('-created_at')
        data = []
        for tournament in tournaments:
            item = tournament.to_dict()
            item['registered_count'] = TournamentRegistration.objects(
                tournament_id=tournament.id
            ).count()
            data.append(item)
        return jsonify(format_success(data=data)), 200
    except Exception as error:
        current_app.logger.exception('Could not load admin tournaments')
        return jsonify(format_error(f'Could not load tournaments: {error}')), 500


@admin_bp.route('/tournaments', methods=['POST'])
@admin_required
def create_tournament():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(format_error('A JSON request body is required')), 400

    name = data.get('name')
    description = data.get('description', '')
    tournament_type = data.get('tournament_type')
    start_at_value = data.get('start_at')
    entry_fee = data.get('entry_fee', 0)
    if not isinstance(name, str) or not name.strip():
        return jsonify(format_error('Tournament name is required')), 400
    if len(name.strip()) > 255:
        return jsonify(format_error('Tournament name must be 255 characters or fewer')), 400
    if not isinstance(description, str):
        return jsonify(format_error('Tournament description must be text')), 400
    if tournament_type not in ('league', 'group_knockout'):
        return jsonify(format_error('Choose a supported tournament type')), 400
    if not isinstance(entry_fee, int) or isinstance(entry_fee, bool) or entry_fee < 0:
        return jsonify(format_error('Entry fee must be a non-negative whole number of Footy Coins')), 400
    if not isinstance(start_at_value, str):
        return jsonify(format_error('A tournament start date and time are required')), 400

    try:
        start_at = _parse_utc(start_at_value)
    except (TypeError, ValueError):
        return jsonify(format_error('Enter a valid tournament start date and time')), 400
    if start_at <= datetime.utcnow():
        return jsonify(format_error('Tournament start date must be in the future')), 400

    tournament = Tournament(
        id=generate_id(),
        name=name.strip(),
        description=description.strip(),
        tournament_type=tournament_type,
        entry_fee=entry_fee,
        max_players=20,
        start_at=start_at,
        status='registration' if tournament_type == 'league' else 'draft',
    )
    try:
        tournament.save()
        return jsonify(format_success(
            data=tournament.to_dict(),
            message=(
                'Tournament created'
                if tournament_type == 'league'
                else 'Group stage + knockout tournament saved as a draft'
            ),
        )), 201
    except Exception as error:
        current_app.logger.exception('Could not create tournament')
        return jsonify(format_error(f'Could not create tournament: {error}')), 500


@admin_bp.route('/tournaments/<tournament_id>', methods=['DELETE'])
@admin_required
def delete_tournament(tournament_id):
    try:
        tournament = Tournament.objects(id=tournament_id).first()
        if not tournament:
            return jsonify(format_error('Tournament not found')), 404

        tournament_quizzes = list(Quiz.objects(
            destination='tournament',
            tournament_id=tournament.id,
        ))
        quiz_ids = [quiz.id for quiz in tournament_quizzes]
        if quiz_ids:
            QuizAttempt.objects(quiz_id__in=quiz_ids).delete()
            QuizResponse.objects(quiz_id__in=quiz_ids).delete()
            for quiz in tournament_quizzes:
                quiz.delete()

        TournamentSubmission.objects(tournament_id=tournament.id).delete()
        TournamentFixture.objects(tournament_id=tournament.id).delete()
        TournamentRegistration.objects(tournament_id=tournament.id).delete()
        tournament.delete()
        return jsonify(format_success(message='Tournament deleted')), 200
    except Exception as error:
        current_app.logger.exception('Could not delete tournament %s', tournament_id)
        return jsonify(format_error(f'Could not delete tournament: {error}')), 500


@admin_bp.route('/tournaments/<tournament_id>/restart', methods=['POST'])
@admin_required
def restart_tournament_route(tournament_id):
    tournament = Tournament.objects(id=tournament_id).first()
    if not tournament:
        return jsonify(format_error('Tournament not found')), 404
    if tournament.tournament_type != 'league' or tournament.status != 'completed':
        return jsonify(format_error('Only completed 1v1 league tournaments can be restarted')), 409

    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not isinstance(data.get('start_at'), str):
        return jsonify(format_error('A scheduled restart date and time are required')), 400
    try:
        start_at = _parse_utc(data['start_at'])
    except (TypeError, ValueError):
        return jsonify(format_error('Enter a valid restart date and time')), 400
    if start_at <= datetime.utcnow():
        return jsonify(format_error('Restart date and time must be in the future')), 400

    try:
        notification_queued = schedule_tournament_restart(tournament, start_at)
        tournament.reload()
        return jsonify(format_success(
            data=tournament.to_dict(),
            message=(
                'Restart scheduled and players have been notified'
                if notification_queued
                else 'Restart scheduled. Players will see the prompt in the app, but the bot notification could not be queued.'
            ),
        )), 200
    except ValueError as error:
        return jsonify(format_error(str(error))), 409
    except Exception as error:
        current_app.logger.exception('Could not restart tournament %s', tournament_id)
        return jsonify(format_error(f'Could not restart tournament: {error}')), 500


@admin_bp.route('/analytics', methods=['GET'])
@admin_required
def get_analytics():
    """Get current platform totals and UTC daily engagement metrics."""
    try:
        now = datetime.utcnow()
        start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
        today_attempts = QuizAttempt.objects(started_at__gte=start_of_day)
        completed_today_attempts = today_attempts.filter(completed_at__ne=None)

        active_quizzes = Quiz.objects(is_active=True, expires_at__gt=now)
        active_quiz_count = sum(
            1 for quiz in active_quizzes
            if not quiz.scheduled_for or quiz.scheduled_for <= now
        )

        quiz_starters_today = set(today_attempts.distinct('user_id'))
        quiz_completions_today = QuizResponse.objects(
            completed_at__gte=start_of_day,
            completed_at__lt=now,
        )
        active_players_today = quiz_starters_today | set(
            quiz_completions_today.distinct('user_id')
        )
        active_players_today.update(AppLaunch.objects(
            launched_at__gte=start_of_day,
            launched_at__lt=now,
        ).distinct('user_id'))
        league_creator_count = len(set(League.objects.distinct('creator_id')))

        total_quiz_starts_today = today_attempts.count()
        completed_quiz_starts_today = completed_today_attempts.count()
        completion_rate = (
            round(completed_quiz_starts_today / total_quiz_starts_today * 100, 1)
            if total_quiz_starts_today
            else 0
        )

        return jsonify(format_success(data={
            'generated_at': now.isoformat() + 'Z',
            'total_players': User.objects.count(),
            'daily_active_users': len(active_players_today),
            'new_users_today': User.objects(
                created_at__gte=start_of_day,
                created_at__lt=now,
            ).count(),
            'league_members_joined_today': UserLeague.objects(
                joined_at__gte=start_of_day,
                joined_at__lt=now,
            ).count(),
            'total_league_memberships': UserLeague.objects.count(),
            'leagues_created': League.objects.count(),
            'league_creators': league_creator_count,
            'leagues_created_today': League.objects(
                created_at__gte=start_of_day,
                created_at__lt=now,
            ).count(),
            'active_quizzes': active_quiz_count,
            'quiz_players_today': len(quiz_starters_today),
            'quiz_starts_today': total_quiz_starts_today,
            'quiz_completions_today': quiz_completions_today.count(),
            'quiz_completion_rate': completion_rate,
        })), 200

    except Exception as error:
        current_app.logger.exception('Could not load admin analytics')
        return jsonify(format_error(f'Could not load analytics: {str(error)}')), 500


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
            expires_at = _parse_utc(data['expires_at'])
        scheduled_for = _parse_utc(data['scheduled_for']) if data.get('scheduled_for') else None
        destination, tournament_assignment, destination_error = _quiz_destination(
            data,
            scheduled_for,
        )
        if destination_error:
            return jsonify(format_error(destination_error)), 400
        if destination == 'tournament' and data.get('cost_in_footy_coins', 0) != 0:
            return jsonify(format_error('Tournament quizzes are included in the tournament entry fee')), 400
        tournament_id, tournament_gameweek = (
            tournament_assignment if tournament_assignment else (None, None)
        )

        quiz = Quiz(
            id=generate_id(),
            name=data['name'],
            description=data.get('description'),
            total_questions=data['total_questions'],
            time_limit_seconds=data['time_limit_seconds'],
            points_per_question=data.get('points_per_question', 10),
            total_points=data['total_points'],
            cost_in_footy_coins=data.get('cost_in_footy_coins', 0),
            destination=destination,
            tournament_id=tournament_id,
            tournament_gameweek=tournament_gameweek,
            is_active=True,
            expires_at=expires_at,
            scheduled_for=scheduled_for,
            notification_sent=not bool(scheduled_for),
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
            scheduled_for = _parse_utc(data['scheduled_for'])

        destination, tournament_assignment, destination_error = _quiz_destination(
            data,
            scheduled_for,
        )
        if destination_error:
            return jsonify(format_error(destination_error)), 400
        if destination == 'tournament' and data.get('cost_in_footy_coins', 0) != 0:
            return jsonify(format_error('Tournament quizzes are included in the tournament entry fee')), 400

        tournament_id, tournament_gameweek = (
            tournament_assignment if tournament_assignment else (None, None)
        )

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
            destination=destination,
            tournament_id=tournament_id,
            tournament_gameweek=tournament_gameweek,
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
                user_telegram_ids = None
                tournament_name = None
                if destination == 'tournament':
                    tournament = Tournament.objects(id=tournament_id).first()
                    if not tournament:
                        raise ValueError(f'Tournament {tournament_id} no longer exists')
                    tournament_name = tournament.name
                    user_ids = TournamentRegistration.objects(
                        tournament_id=tournament_id
                    ).distinct('user_id')
                    user_telegram_ids = [
                        user.telegram_id
                        for user in User.objects(id__in=user_ids).only('telegram_id')
                        if user.telegram_id
                    ]
                telegram_service.send_quiz_notification(
                    quiz.name,
                    quiz.description,
                    quiz.total_questions,
                    quiz.total_points,
                    user_telegram_ids=user_telegram_ids,
                    async_send=True,
                    expires_at=quiz.expires_at,
                    tournament_name=tournament_name,
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
        user_telegram_ids = None
        tournament_name = None
        if getattr(quiz, 'destination', 'game') == 'tournament':
            tournament = Tournament.objects(id=quiz.tournament_id).first()
            if not tournament:
                return jsonify(format_error('Tournament not found for this quiz')), 404
            tournament_name = tournament.name
            user_ids = TournamentRegistration.objects(
                tournament_id=quiz.tournament_id
            ).distinct('user_id')
            user_telegram_ids = [
                user.telegram_id
                for user in User.objects(id__in=user_ids).only('telegram_id')
                if user.telegram_id
            ]
        queued = telegram_service.send_quiz_notification(
            quiz.name,
            quiz.description or '',
            quiz.total_questions,
            quiz.total_points,
            user_telegram_ids=user_telegram_ids,
            async_send=True,
            expires_at=quiz.expires_at,
            tournament_name=tournament_name,
        )
        if not queued:
            return jsonify(format_error('The quiz notification could not be queued')), 503

        quiz.notification_sent = True
        quiz.save()

        return jsonify(format_success(
            message='Quiz notification is being sent to users via the bot'
        )), 200
    except Exception as e:
        return jsonify(format_error(str(e))), 500
