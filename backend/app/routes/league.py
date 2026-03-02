from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import User, League, UserLeague
from app.utils import generate_id, format_success, format_error, generate_league_code
from datetime import datetime

league_bp = Blueprint('league', __name__, url_prefix='/api/leagues')


def user_league_dict(ul, league):
    """Build the response shape the frontend's UserLeague type expects."""
    return {
        'id': ul.id,
        'user_id': ul.user_id,
        'league_id': ul.league_id,
        'name': league.name,
        'description': league.description,
        'is_private': league.is_private,
        'code': league.code if ul.is_owner else None,  # only expose code to owner
        'total_members': league.total_members,
        'rank': ul.rank,
        'points': ul.points,
        'is_owner': ul.is_owner,
        'joined_at': ul.joined_at.isoformat(),
    }


@league_bp.route('', methods=['POST'])
@jwt_required()
def create_league():
    """Create a new league. POST /api/leagues"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()

        name = data.get('name', '').strip()
        description = data.get('description', '').strip()
        is_private = data.get('is_private', False)

        if not name:
            return jsonify(format_error('League name is required')), 400

        league = League(
            id=generate_id(),
            name=name,
            description=description,
            is_private=is_private,
            code=generate_league_code() if is_private else None,
            creator_id=user_id,
            total_members=1
        )
        league.save()

        ul = UserLeague(
            id=generate_id(),
            user_id=user_id,
            league_id=league.id,
            is_owner=True,
            rank=1,
            points=0
        )
        ul.save()

        return jsonify(format_success(
            data=user_league_dict(ul, league),
            message='League created successfully'
        )), 201

    except Exception as e:
        return jsonify(format_error(f'Error creating league: {str(e)}')), 500


@league_bp.route('/user', methods=['GET'])
@jwt_required()
def get_user_leagues():
    """Get all leagues the current user belongs to. GET /api/leagues/user"""
    try:
        user_id = get_jwt_identity()
        user_leagues = UserLeague.objects(user_id=user_id)

        result = []
        for ul in user_leagues:
            league = League.objects(id=ul.league_id).first()
            if league:
                result.append(user_league_dict(ul, league))

        return jsonify(format_success(data=result)), 200

    except Exception as e:
        return jsonify(format_error(f'Error fetching leagues: {str(e)}')), 500


@league_bp.route('/public', methods=['GET'])
@jwt_required()
def get_public_leagues():
    """Get top N public leagues. GET /api/leagues/public?limit=3"""
    try:
        limit = request.args.get('limit', 3, type=int)
        leagues = League.objects(is_private=False).order_by('-total_members').limit(limit)
        return jsonify(format_success(data=[l.to_dict() for l in leagues])), 200

    except Exception as e:
        return jsonify(format_error(f'Error fetching public leagues: {str(e)}')), 500


@league_bp.route('/search', methods=['GET'])
@jwt_required()
def search_leagues():
    """Search public leagues by name or description. GET /api/leagues/search?q=..."""
    try:
        q = request.args.get('q', '').strip()

        if not q:
            return jsonify(format_success(data=[])), 200

        leagues = League.objects(
            is_private=False,
            __raw__={
                '$or': [
                    {'name': {'$regex': q, '$options': 'i'}},
                    {'description': {'$regex': q, '$options': 'i'}},
                ]
            }
        )

        return jsonify(format_success(data=[l.to_dict() for l in leagues])), 200

    except Exception as e:
        return jsonify(format_error(f'Error searching leagues: {str(e)}')), 500


@league_bp.route('/join', methods=['POST'])
@jwt_required()
def join_private_league():
    """Join a private league with a 6-character code. POST /api/leagues/join"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        code = data.get('code', '').strip().upper()

        if len(code) != 6:
            return jsonify(format_error('Please enter a valid 6-character code')), 400

        league = League.objects(code=code).first()
        if not league:
            return jsonify(format_error('No league found with that code')), 404

        existing = UserLeague.objects(user_id=user_id, league_id=league.id).first()
        if existing:
            return jsonify(format_error('You are already a member of this league')), 400

        ul = UserLeague(
            id=generate_id(),
            user_id=user_id,
            league_id=league.id,
            is_owner=False,
            rank=league.total_members + 1,
            points=0
        )
        ul.save()

        league.total_members += 1
        league.save()

        return jsonify(format_success(
            data=user_league_dict(ul, league),
            message='Successfully joined league'
        )), 200

    except Exception as e:
        return jsonify(format_error(f'Error joining league: {str(e)}')), 500


@league_bp.route('/<league_id>/join-public', methods=['POST'])
@jwt_required()
def join_public_league(league_id):
    """Join a public league directly by ID. POST /api/leagues/<id>/join-public"""
    try:
        user_id = get_jwt_identity()

        league = League.objects(id=league_id).first()
        if not league:
            return jsonify(format_error('League not found')), 404

        if league.is_private:
            return jsonify(format_error('This is a private league. Use a code to join.')), 400

        existing = UserLeague.objects(user_id=user_id, league_id=league.id).first()
        if existing:
            return jsonify(format_error('You are already a member of this league')), 400

        ul = UserLeague(
            id=generate_id(),
            user_id=user_id,
            league_id=league.id,
            is_owner=False,
            rank=league.total_members + 1,
            points=0
        )
        ul.save()

        league.total_members += 1
        league.save()

        return jsonify(format_success(
            data=user_league_dict(ul, league),
            message='Successfully joined league'
        )), 200

    except Exception as e:
        return jsonify(format_error(f'Error joining public league: {str(e)}')), 500