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
            )
        else:
            battle = Battle.objects(
                id=battle_id,
                opponent_id=user_id,
                status='pending',
            ).modify(new=True, set__status='declined', set__completed_at=datetime.utcnow())
        if not battle:
            return jsonify(format_error(
                'This challenge is no longer available to respond to'
            )), 409
        return jsonify(format_success(
            data=serialize_battle(battle, user_id),
            message='Challenge accepted' if action == 'accept' else 'Challenge declined',
        )), 200
    except Exception as error:
        current_app.logger.exception('Could not respond to 1v1 challenge')
        return jsonify(format_error(f'Could not respond to challenge: {str(error)}')), 500

