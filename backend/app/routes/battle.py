import re
from datetime import datetime

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.models import Battle, User
from app.services.battle_service import (
    BATTLE_DURATION,
    serialize_battle,
    sync_battles,
)
from app.utils import format_error, format_success

battle_bp = Blueprint('battle', __name__, url_prefix='/api/battles')


@battle_bp.route('/players', methods=['GET'])
@jwt_required()
def search_players():
    try:
        user_id = get_jwt_identity()
        query = (request.args.get('q') or '').strip()
        if len(query) < 2:
            return jsonify(format_success(data=[])), 200

        query_tokens = [re.escape(token) for token in query.split()]
        players = User.objects(
            id__ne=user_id,
            __raw__={
                '$and': [
                    {'$or': [
                        {'first_name': {'$regex': token, '$options': 'i'}},
                        {'last_name': {'$regex': token, '$options': 'i'}},
                        {'username': {'$regex': token, '$options': 'i'}},
                    ]}
                    for token in query_tokens
                ]
            },
        ).only('id', 'first_name', 'last_name', 'username', 'photo_url').limit(20)
        return jsonify(format_success(data=[{
            'id': player.id,
            'name': ' '.join(filter(None, [player.first_name, player.last_name])),
            'username': player.username,
            'photo_url': player.photo_url,
        } for player in players])), 200
    except Exception as error:
        current_app.logger.exception('Could not search battle players')
        return jsonify(format_error(f'Could not search players: {str(error)}')), 500


@battle_bp.route('', methods=['GET'])
@jwt_required()
def list_battles():
    try:
        user_id = get_jwt_identity()
        sync_battles()
        battles = Battle.objects(
            __raw__={
                '$or': [
                    {'challenger_id': user_id},
                    {'opponent_id': user_id},
                ]
            }
        ).order_by('-challenged_at').limit(100)
        return jsonify(format_success(data=[
            serialize_battle(battle, user_id) for battle in battles
        ])), 200
    except Exception as error:
        current_app.logger.exception('Could not fetch 1v1 battles')
        return jsonify(format_error(f'Could not fetch battles: {str(error)}')), 500


@battle_bp.route('/summary', methods=['GET'])
@jwt_required()
def get_battle_summary():
    try:
        user_id = get_jwt_identity()
        pending_incoming = Battle.objects(
            opponent_id=user_id,
            status='pending',
        ).count()
        pending_outgoing = Battle.objects(
            challenger_id=user_id,
            status='pending',
        ).count()
        response_notifications = Battle.objects(
            challenger_id=user_id,
            challenger_response_unread=True,
        ).count()
        return jsonify(format_success(data={
            'pending_incoming': pending_incoming,
            'pending_outgoing': pending_outgoing,
            'active': Battle.objects(
                status='active',
                __raw__={
                    '$or': [
                        {'challenger_id': user_id},
                        {'opponent_id': user_id},
                    ]
                },
            ).count(),
            'unread_count': pending_incoming + response_notifications,
        })), 200
    except Exception as error:
        current_app.logger.exception('Could not fetch battle summary')
        return jsonify(format_error(f'Could not fetch battle summary: {str(error)}')), 500


@battle_bp.route('/notifications/read', methods=['POST'])
@jwt_required()
def mark_battle_notifications_read():
    try:
        user_id = get_jwt_identity()
        Battle.objects(
            challenger_id=user_id,
            challenger_response_unread=True,
        ).update(set__challenger_response_unread=False)
        return jsonify(format_success(message='Battle notifications marked as read')), 200
    except Exception as error:
        current_app.logger.exception('Could not mark battle notifications as read')
        return jsonify(format_error(
            f'Could not mark battle notifications as read: {str(error)}'
        )), 500


@battle_bp.route('', methods=['POST'])
@jwt_required()
def create_battle():
    try:
        user_id = get_jwt_identity()
        opponent_id = (request.get_json(silent=True) or {}).get('opponent_id')
        if not isinstance(opponent_id, str) or not opponent_id:
            return jsonify(format_error('A player to challenge is required')), 400
        if opponent_id == user_id:
            return jsonify(format_error('You cannot challenge yourself')), 400
        opponent = User.objects(id=opponent_id).first()
        if not opponent:
            return jsonify(format_error('Player not found')), 404
        sync_battles()

        active_duplicate = Battle.objects(
            status__in=['pending', 'active'],
            __raw__={
                '$or': [
                    {'challenger_id': user_id, 'opponent_id': opponent_id},
                    {'challenger_id': opponent_id, 'opponent_id': user_id},
                ]
            },
        ).first()
        if active_duplicate:
            return jsonify(format_error(
                'There is already an open challenge between you and this player'
            )), 409

        battle = Battle(
            challenger_id=user_id,
            opponent_id=opponent_id,
            status='pending',
            challenged_at=datetime.utcnow(),
        ).save()
        from app.services.telegram_service import get_telegram_service

        challenger = User.objects(id=user_id).only('first_name').first()
        notification_sent = get_telegram_service().send_battle_notification(
            opponent.telegram_id,
            (
                f'⚔️ 1v1 Battle challenge!\n\n'
                f'{challenger.first_name if challenger else "A player"} challenged you '
                'to a 24-hour Footy IQ battle. Open the app to accept or decline.'
            ),
        )
        if not notification_sent:
            current_app.logger.warning(
                'Could not deliver challenge notification for battle %s to user %s',
                battle.id,
                opponent.id,
            )
        return jsonify(format_success(
            data=serialize_battle(battle, user_id),
            message='Challenge sent',
        )), 201
    except Exception as error:
        current_app.logger.exception('Could not create 1v1 challenge')
        return jsonify(format_error(f'Could not create challenge: {str(error)}')), 500


@battle_bp.route('/<battle_id>/respond', methods=['POST'])
@jwt_required()
def respond_to_challenge(battle_id):
    try:
        user_id = get_jwt_identity()
        action = (request.get_json(silent=True) or {}).get('action')
        if action not in ('accept', 'decline'):
            return jsonify(format_error('Action must be accept or decline')), 400
        if action == 'accept':
            now = datetime.utcnow()
            battle = Battle.objects(
                id=battle_id,
                opponent_id=user_id,
                status='pending',
                challenged_at__gt=now - BATTLE_DURATION,
            ).modify(
                new=True,
                set__status='active',
                set__started_at=now,
                set__expires_at=now + BATTLE_DURATION,
                set__challenger_response_unread=True,
            )
        else:
            battle = Battle.objects(
                id=battle_id,
                opponent_id=user_id,
                status='pending',
            ).modify(
                new=True,
                set__status='declined',
                set__completed_at=datetime.utcnow(),
                set__challenger_response_unread=True,
            )
        if not battle:
            return jsonify(format_error(
                'This challenge is no longer available to respond to'
            )), 409
        from app.services.telegram_service import get_telegram_service

        responder = User.objects(id=user_id).only('first_name').first()
        challenger = User.objects(id=battle.challenger_id).only('telegram_id').first()
        if challenger:
            decision_text = (
                'accepted your challenge. The 24-hour battle has started!'
                if action == 'accept'
                else 'declined your 1v1 battle challenge.'
            )
            notification_sent = get_telegram_service().send_battle_notification(
                challenger.telegram_id,
                f'⚔️ {responder.first_name if responder else "Your opponent"} {decision_text}',
            )
            if not notification_sent:
                current_app.logger.warning(
                    'Could not deliver %s notification for battle %s to user %s',
                    action,
                    battle.id,
                    challenger.id,
                )
        return jsonify(format_success(
            data=serialize_battle(battle, user_id),
            message='Challenge accepted' if action == 'accept' else 'Challenge declined',
        )), 200
    except Exception as error:
        current_app.logger.exception('Could not respond to 1v1 challenge')
        return jsonify(format_error(f'Could not respond to challenge: {str(error)}')), 500


@battle_bp.route('/challenge-invite/<invite_code>', methods=['GET'])
def get_challenge_invite(invite_code):
    """Retrieve challenger profile details from a challenge invite link."""
    try:
        parts = invite_code.strip().split('_')
        code = parts[0]
        score = None
        if len(parts) > 1 and parts[1].isdigit():
            score = int(parts[1])

        challenger = User.objects(referral_code=code).first()
        if not challenger:
            challenger = User.objects(id=code).first()

        if not challenger:
            return jsonify(format_error('Challenger not found')), 404

        current_user_id = None
        try:
            from flask_jwt_extended import verify_jwt_in_request
            verify_jwt_in_request(optional=True)
            current_user_id = get_jwt_identity()
        except Exception:
            pass

        return jsonify(format_success(data={
            'challenger': {
                'id': challenger.id,
                'first_name': challenger.first_name,
                'last_name': challenger.last_name,
                'name': ' '.join(filter(None, [challenger.first_name, challenger.last_name])),
                'username': challenger.username,
                'photo_url': challenger.photo_url,
                'overall_score': challenger.overall_score,
            },
            'quiz_score': score,
            'is_self': bool(current_user_id and current_user_id == challenger.id),
        })), 200
    except Exception as error:
        current_app.logger.exception('Could not fetch challenge invite info')
        return jsonify(format_error(f'Could not fetch challenge invite info: {str(error)}')), 500
