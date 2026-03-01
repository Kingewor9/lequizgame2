from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import User, League, UserLeague
from app.utils import generate_id, format_success, format_error, generate_league_code
from datetime import datetime

league_bp = Blueprint('league', __name__, url_prefix='/api/leagues')


@league_bp.route('', methods=['POST'])
@jwt_required()
def create_league():
    """Create a new league"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        
        name = data.get('name')
        description = data.get('description', '')
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
        
        # Add creator as member
        user_league = UserLeague(
            id=generate_id(),
            user_id=user_id,
            league_id=league.id,
            is_owner=True,
            rank=1,
            points=0
        )
        user_league.save()
        
        return jsonify(format_success(
            data=league.to_dict(),
            message='League created successfully'
        )), 201
    
    except Exception as e:
        return jsonify(format_error(f'Error creating league: {str(e)}')), 500


@league_bp.route('/user', methods=['GET'])
@jwt_required()
def get_user_leagues():
    """Get user's leagues"""
    try:
        user_id = get_jwt_identity()
        
        user_leagues = UserLeague.objects(user_id=user_id)
        
        result = []
        for ul in user_leagues:
            league = League.objects(id=ul.league_id).first()
            if league:
                result.append({
                    'id': ul.id,
                    'user_id': ul.user_id,
                    'league_id': ul.league_id,
                    'league': league.to_dict(),
                    'rank': ul.rank,
                    'points': ul.points,
                    'is_owner': ul.is_owner,
                    'joined_at': ul.joined_at.isoformat(),
                })
        
        return jsonify(format_success(data=result)), 200
    
    except Exception as e:
        return jsonify(format_error(f'Error fetching leagues: {str(e)}')), 500


@league_bp.route('/public', methods=['GET'])
@jwt_required()
def get_public_leagues():
    """Get public leagues"""
    try:
        limit = request.args.get('limit', 3, type=int)
        
        leagues = League.objects(is_private=False).limit(limit)
        
        return jsonify(format_success(data=[l.to_dict() for l in leagues])), 200
    
    except Exception as e:
        return jsonify(format_error(f'Error fetching leagues: {str(e)}')), 500


@league_bp.route('/search', methods=['GET'])
@jwt_required()
def search_leagues():
    """Search public leagues"""
    try:
        q = request.args.get('q', '', type=str)
        
        if not q:
            return jsonify(format_success(data=[])), 200
        
        leagues = League.objects(
            is_private=False,
            __raw__={
                '$or': [
                    {'name': {'$regex': q, '$options': 'i'}},
                    {'description': {'$regex': q, '$options': 'i'}}
                ]
            }
        )
        
        return jsonify(format_success(data=[l.to_dict() for l in leagues])), 200
    
    except Exception as e:
        return jsonify(format_error(f'Error searching leagues: {str(e)}')), 500


@league_bp.route('/join', methods=['POST'])
@jwt_required()
def join_league():
    """Join a league with code"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        
        code = data.get('code', '').strip()
        
        if not code:
            return jsonify(format_error('League code is required')), 400
        
        league = League.objects(code=code).first()
        
        if not league:
            return jsonify(format_error('League not found')), 404
        
        # Check if already member
        existing = UserLeague.objects(user_id=user_id, league_id=league.id).first()
        
        if existing:
            return jsonify(format_error('Already a member of this league')), 400
        
        # Add to league
        user_league = UserLeague(
            id=generate_id(),
            user_id=user_id,
            league_id=league.id,
            is_owner=False,
            rank=league.total_members + 1,
            points=0
        )
        user_league.save()
        
        league.total_members += 1
        league.save()
        
        return jsonify(format_success(
            data=league.to_dict(),
            message='Successfully joined league'
        )), 200
    
    except Exception as e:
        return jsonify(format_error(f'Error joining league: {str(e)}')), 500
