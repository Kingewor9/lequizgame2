from datetime import datetime

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.models import (
    FootyCoinTransaction,
    Quiz,
    Tournament,
    TournamentFixture,
    TournamentRegistration,
    TournamentSubmission,
    User,
)
from app.services.telegram_service import get_telegram_service
from app.services.tournament_service import calculate_standings, sync_tournament
from app.utils import format_error, format_success, generate_id


tournament_bp = Blueprint('tournament', __name__, url_prefix='/api/tournaments')


def _fixture_for_user(fixture, user_id):
    is_player_one = fixture.player_one_id == user_id
    opponent_id = fixture.player_two_id if is_player_one else fixture.player_one_id
    opponent = User.objects(id=opponent_id).first() if opponent_id else None
    player = User.objects(id=user_id).first()
    submissions = {
        submission.user_id: submission
        for submission in TournamentSubmission.objects(
            tournament_id=fixture.tournament_id,
            gameweek=fixture.gameweek,
        )
    }
    own_submission = submissions.get(user_id)
    opponent_submission = submissions.get(opponent_id) if opponent_id else None
    return {
        'id': fixture.id,
        'gameweek': fixture.gameweek,
        'scheduled_at': fixture.scheduled_at.isoformat() + 'Z',
        'closes_at': fixture.closes_at.isoformat() + 'Z',
        'status': fixture.status,
        'result': fixture.result,
        'winner_user_id': fixture.winner_user_id,
        'player': {
            'id': player.id,
            'name': ' '.join(filter(None, [player.first_name, player.last_name])),
            'photo_url': player.photo_url,
        } if player else None,
        'opponent': {
            'id': opponent.id,
            'name': ' '.join(filter(None, [opponent.first_name, opponent.last_name])),
            'photo_url': opponent.photo_url,
        } if opponent else None,
        'player_score': (
            own_submission.points_earned
            if own_submission
            else (fixture.player_one_score if is_player_one else fixture.player_two_score)
            if fixture.status == 'completed'
            else None
        ),
        'opponent_score': (
            opponent_submission.points_earned
            if opponent_submission
            else (fixture.player_two_score if is_player_one else fixture.player_one_score)
            if fixture.status == 'completed'
            else None
        ),
        'player_submitted': own_submission is not None,
        'opponent_submitted': opponent_submission is not None,
    }


def _unanswered_quiz_count(tournament, user_id, now):
    if tournament.status != 'active':
        return 0

    gameweek = min(
        max(1, int((now - tournament.start_at).total_seconds() // 86400) + 1),
        tournament.total_gameweeks,
    )
    fixture = TournamentFixture.objects(
        tournament_id=tournament.id,
        gameweek=gameweek,
        status='scheduled',
        __raw__={
            '$or': [
                {'player_one_id': user_id},
                {'player_two_id': user_id},
            ],
        },
    ).first()
    if not fixture or not fixture.player_two_id or fixture.closes_at <= now:
        return 0

    quizzes = Quiz.objects(
        destination='tournament',
        tournament_id=tournament.id,
        tournament_gameweek=gameweek,
        is_active=True,
        expires_at__gt=now,
    ).order_by('-created_at')
    quiz = next(
        (
            candidate for candidate in quizzes
            if not candidate.scheduled_for or candidate.scheduled_for <= now
        ),
        None,
    )
    if not quiz:
        return 0

    return int(
        TournamentSubmission.objects(
            user_id=user_id,
            quiz_id=quiz.id,
        ).first() is None
    )


@tournament_bp.route('', methods=['GET'])
@jwt_required()
def list_tournaments():
    try:
        user_id = get_jwt_identity()
        now = datetime.utcnow()
        tournaments = Tournament.objects(
            status__in=['registration', 'active', 'completed', 'cancelled', 'draft', 'renewal']
        ).order_by('start_at')
        registrations = {
            registration.tournament_id
            for registration in TournamentRegistration.objects(user_id=user_id)
        }
        data = []
        for tournament in tournaments:
            item = tournament.to_dict()
            item['registered'] = tournament.id in registrations
            item['available'] = tournament.tournament_type == 'league'
            item['registered_count'] = TournamentRegistration.objects(
                tournament_id=tournament.id
            ).count()
            item['unanswered_quiz_count'] = (
                _unanswered_quiz_count(tournament, user_id, now)
                if item['registered'] else 0
            )
            data.append(item)
        return jsonify(format_success(data=data)), 200
    except Exception as error:
        current_app.logger.exception('Could not list tournaments')
        return jsonify(format_error(f'Could not load tournaments: {error}')), 500


@tournament_bp.route('/renewals', methods=['GET'])
@jwt_required()
def get_pending_tournament_renewals():
    try:
        user_id = get_jwt_identity()
        pending_registrations = list(TournamentRegistration.objects(
            user_id=user_id,
            renewal_status='pending',
        ))
        renewals = []
        for registration in pending_registrations:
            tournament = Tournament.objects(
                id=registration.tournament_id,
                status='renewal',
            ).first()
            if not tournament:
                continue
            sync_tournament(tournament)
            tournament.reload()
            if tournament.status != 'renewal' or tournament.start_at <= datetime.utcnow():
                continue
            renewals.append({
                'tournament_id': tournament.id,
                'tournament_name': tournament.name,
                'start_at': tournament.start_at.isoformat() + 'Z',
                'entry_fee': tournament.entry_fee,
            })
        return jsonify(format_success(data=renewals)), 200
    except Exception as error:
        current_app.logger.exception('Could not load tournament renewal prompts')
        return jsonify(format_error(f'Could not load renewal prompts: {error}')), 500


@tournament_bp.route('/renewals/<tournament_id>', methods=['POST'])
@jwt_required()
def respond_to_tournament_renewal(tournament_id):
    user_id = get_jwt_identity()
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or data.get('decision') not in ('yes', 'no'):
        return jsonify(format_error('Choose yes or no to respond to the tournament renewal')), 400

    now = datetime.utcnow()
    tournament = Tournament.objects(
        id=tournament_id,
        status='renewal',
        start_at__gt=now,
    ).first()
    if not tournament:
        return jsonify(format_error('The tournament renewal is no longer accepting responses')), 409
    registration = TournamentRegistration.objects(
        tournament_id=tournament.id,
        user_id=user_id,
        renewal_status='pending',
    ).first()
    if not registration:
        return jsonify(format_error('No pending renewal response was found')), 409

    if data['decision'] == 'no':
        deleted_count = TournamentRegistration.objects(
            id=registration.id,
            renewal_status='pending',
        ).delete()
        if not deleted_count:
            return jsonify(format_error('The renewal response has already been submitted')), 409
        Tournament.objects(id=tournament.id).update_one(dec__registered_count=1)
        return jsonify(format_success(message='You have left the next tournament season')), 200

    user = User.objects(id=user_id).first()
    if not user:
        return jsonify(format_error('User not found')), 404

    if tournament.entry_fee:
        user = User.objects(
            id=user_id,
            footy_coins__gte=tournament.entry_fee,
        ).modify(new=True, dec__footy_coins=tournament.entry_fee)
        if not user:
            return jsonify(format_error('You do not have enough Footy Coins to continue')), 400

    accepted_registration = TournamentRegistration.objects(
        id=registration.id,
        renewal_status='pending',
    ).modify(new=True, set__renewal_status='accepted')
    if not accepted_registration:
        if tournament.entry_fee:
            User.objects(id=user_id).update_one(inc__footy_coins=tournament.entry_fee)
        return jsonify(format_error('The renewal response has already been submitted')), 409

    try:
        if tournament.entry_fee:
            FootyCoinTransaction(
                id=generate_id(),
                user_id=user_id,
                type='spent',
                amount=tournament.entry_fee,
                reason=f'Tournament renewal: {tournament.name}',
            ).save()
    except Exception as error:
        TournamentRegistration.objects(id=registration.id).update_one(
            set__renewal_status='pending'
        )
        if tournament.entry_fee:
            User.objects(id=user_id).update_one(inc__footy_coins=tournament.entry_fee)
        current_app.logger.exception('Could not record tournament renewal fee')
        return jsonify(format_error(f'Could not complete tournament renewal: {error}')), 500

    return jsonify(format_success(
        data={'footy_coins': user.footy_coins},
        message='You are registered for the next tournament season',
    )), 200


@tournament_bp.route('/<tournament_id>', methods=['GET'])
@jwt_required()
def get_tournament(tournament_id):
    try:
        user_id = get_jwt_identity()
        tournament = Tournament.objects(id=tournament_id).first()
        if not tournament:
            return jsonify(format_error('Tournament not found')), 404

        sync_tournament(tournament)
        tournament.reload()
        registration = TournamentRegistration.objects(
            tournament_id=tournament.id,
            user_id=user_id,
        ).first()
        gameweek = 0
        if tournament.status == 'active':
            elapsed = datetime.utcnow() - tournament.start_at
            gameweek = min(
                max(1, int(elapsed.total_seconds() // 86400) + 1),
                tournament.total_gameweeks,
            )
        elif tournament.status in ('completed', 'renewal'):
            gameweek = tournament.total_gameweeks

        fixtures = []
        current_fixture = None
        quiz_data = None
        if registration and tournament.status in ('active', 'completed', 'renewal'):
            user_fixtures = TournamentFixture.objects(
                tournament_id=tournament.id,
                __raw__={
                    '$or': [
                        {'player_one_id': user_id},
                        {'player_two_id': user_id},
                    ],
                },
            ).order_by('gameweek')
            fixtures = [_fixture_for_user(fixture, user_id) for fixture in user_fixtures]
            current_fixture = next(
                (fixture for fixture in fixtures if fixture['gameweek'] == gameweek),
                None,
            )

            if tournament.status == 'active' and gameweek:
                quiz = Quiz.objects(
                    destination='tournament',
                    tournament_id=tournament.id,
                    tournament_gameweek=gameweek,
                    is_active=True,
                ).first()
                if quiz:
                    already_played = TournamentSubmission.objects(
                        user_id=user_id,
                        quiz_id=quiz.id,
                    ).first() is not None
                    quiz_data = {
                        'id': quiz.id,
                        'name': quiz.name,
                        'description': quiz.description,
                        'total_questions': quiz.total_questions,
                        'time_limit_seconds': quiz.time_limit_seconds,
                        'points_per_question': quiz.points_per_question,
                        'total_points': quiz.total_points,
                        'cost_in_footy_coins': 0,
                        'quiz_type': quiz.quiz_type,
                        'expires_at': quiz.expires_at.isoformat() + 'Z',
                        'scheduled_for': quiz.scheduled_for.isoformat() + 'Z' if quiz.scheduled_for else None,
                        'created_at': quiz.created_at.isoformat() + 'Z',
                        'already_played': already_played,
                    }

        standings = calculate_standings(tournament)
        user_standing = next(
            (row for row in standings if row['user_id'] == user_id),
            None,
        )
        return jsonify(format_success(data={
            'tournament': tournament.to_dict(),
            'registered': registration is not None,
            'current_gameweek': gameweek,
            'live_quiz': quiz_data,
            'current_fixture': current_fixture,
            'fixtures': fixtures,
            'standings': standings,
            'user_standing': user_standing,
        })), 200
    except Exception as error:
        current_app.logger.exception('Could not load tournament %s', tournament_id)
        return jsonify(format_error(f'Could not load tournament: {error}')), 500


@tournament_bp.route('/<tournament_id>/register', methods=['POST'])
@jwt_required()
def register_for_tournament(tournament_id):
    user_id = get_jwt_identity()
    existing = TournamentRegistration.objects(
        tournament_id=tournament_id,
        user_id=user_id,
    ).first()
    if existing:
        return jsonify(format_success(message='You are already registered')), 200

    tournament = Tournament.objects(id=tournament_id).first()
    if not tournament:
        return jsonify(format_error('Tournament not found')), 404
    if tournament.tournament_type != 'league' or tournament.status != 'registration':
        return jsonify(format_error('This tournament is not open for registration')), 409

    now = datetime.utcnow()
    if tournament.start_at <= now:
        return jsonify(format_error('Registration has closed')), 409

    updated_tournament = Tournament.objects(
        id=tournament.id,
        status='registration',
        start_at__gt=now,
        registered_count__lt=tournament.max_players,
    ).modify(new=True, inc__registered_count=1)
    if not updated_tournament:
        return jsonify(format_error('All tournament places are filled or registration has closed')), 409

    user = User.objects(id=user_id).first()
    if not user:
        Tournament.objects(id=tournament.id).update_one(dec__registered_count=1)
        return jsonify(format_error('User not found')), 404

    if tournament.entry_fee:
        user = User.objects(
            id=user_id,
            footy_coins__gte=tournament.entry_fee,
        ).modify(new=True, dec__footy_coins=tournament.entry_fee)
        if not user:
            Tournament.objects(id=tournament.id).update_one(dec__registered_count=1)
            return jsonify(format_error('You do not have enough Footy Coins to enter')), 400

    registration = TournamentRegistration(
        id=generate_id(),
        tournament_id=tournament.id,
        user_id=user_id,
    )
    try:
        registration.save()
        if tournament.entry_fee:
            FootyCoinTransaction(
                id=generate_id(),
                user_id=user_id,
                type='spent',
                amount=tournament.entry_fee,
                reason=f'Tournament entry: {tournament.name}',
            ).save()
    except Exception as error:
        TournamentRegistration.objects(id=registration.id).delete()
        Tournament.objects(id=tournament.id).update_one(dec__registered_count=1)
        if tournament.entry_fee:
            User.objects(id=user_id).update_one(inc__footy_coins=tournament.entry_fee)
        current_app.logger.exception('Could not register user for tournament')
        return jsonify(format_error(f'Could not complete tournament registration: {error}')), 500

    admin_telegram_ids = current_app.config.get('ADMIN_TELEGRAM_IDS', [])
    if admin_telegram_ids:
        try:
            player_name = ' '.join(filter(None, [user.first_name, user.last_name]))
            queued = get_telegram_service().send_tournament_message(
                admin_telegram_ids,
                f'🏆 Tournament registration\n\n'
                f'{player_name} joined {tournament.name}.\n'
                f'Entry fee: {tournament.entry_fee} Footy Coins.',
            )
            if not queued:
                current_app.logger.warning(
                    'Could not queue admin notification for tournament registration %s',
                    registration.id,
                )
        except Exception:
            current_app.logger.exception(
                'Could not notify admins about tournament registration %s',
                registration.id,
            )

    return jsonify(format_success(
        data={
            'tournament_id': tournament.id,
            'footy_coins': user.footy_coins,
        },
        message='Tournament registration successful',
    )), 201
