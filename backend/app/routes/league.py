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
        'name': league.name or '',
        'description': league.description or '',
        'is_private': league.is_private or False,
        'code': (league.code if league.code else None) if ul.is_owner else None,  # only expose code to owner
        'total_members': league.total_members or 1,
        'start_date': (league.start_date.isoformat() + 'Z') if league.start_date else None,
        'end_date': (league.end_date.isoformat() + 'Z') if league.end_date else None,
        'rank': ul.rank or 0,
        'points': ul.points or 0,
        'is_owner': ul.is_owner or False,
        'joined_at': (ul.joined_at.isoformat() + 'Z') if ul.joined_at else (datetime.utcnow().isoformat() + 'Z'),
    }


@league_bp.route('', methods=['POST'])
@jwt_required()
def create_league():
    """Create a new league. POST /api/leagues"""
    try:
        from datetime import datetime, timedelta

        user_id = get_jwt_identity()
        data = request.get_json()

        name        = data.get('name', '').strip()
        description = data.get('description', '').strip()
        is_private  = data.get('is_private', False)
        total_weeks = int(data.get('total_game_weeks', 4))

        # Parse start date sent from frontend (ISO format: YYYY-MM-DD)
        start_date_str = data.get('start_date', '')
        if start_date_str:
            start_date = datetime.strptime(start_date_str, '%Y-%m-%d')
        else:
            start_date = datetime.utcnow()

        # Calculate end date from start + total weeks
        end_date_str = data.get('end_date', '')
        if end_date_str:
            end_date = datetime.strptime(end_date_str, '%Y-%m-%d')
        else:
            end_date = start_date + timedelta(weeks=total_weeks)

        if not name:
            return jsonify(format_error('League name is required')), 400

        if total_weeks < 1 or total_weeks > 6:
            return jsonify(format_error('Total weeks must be between 1 and 6')), 400

        league = League(
            id=generate_id(),
            name=name,
            description=description,
            is_private=is_private,
            code=generate_league_code() if is_private else None,
            creator_id=user_id,
            total_members=1,
            total_game_weeks=total_weeks,
            current_game_week=1,
            start_date=start_date,
            end_date=end_date,
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
            try:
                league = League.objects(id=ul.league_id).first()
                if league:
                    result.append(user_league_dict(ul, league))
            except Exception as e:
                print(f'Error processing league {ul.league_id} for user {user_id}: {str(e)}')
                # Skip this league if there's an error processing it
                continue

        return jsonify(format_success(data=result)), 200

    except Exception as e:
        print(f'Error in get_user_leagues: {str(e)}')
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

        now = datetime.utcnow()
        if league.start_date and league.end_date:
            if league.start_date <= now < league.end_date:
                return jsonify(format_error('Cannot join an active league. You can only join before it starts or after it ends.')), 400

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

        now = datetime.utcnow()
        if league.start_date and league.end_date:
            if league.start_date <= now < league.end_date:
                return jsonify(format_error('Cannot join an active league. You can only join before it starts or after it ends.')), 400

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

@league_bp.route('/<league_id>/detail', methods=['GET'])
@jwt_required()
def get_league_detail(league_id):
    """Full league detail for the detail page. GET /api/leagues/<id>/detail"""
    try:
        user_id = get_jwt_identity()

        league = League.objects(id=league_id).first()
        if not league:
            return jsonify(format_error('League not found')), 404

        # Check user is a member
        my_membership = UserLeague.objects(user_id=user_id, league_id=league_id).first()
        if not my_membership:
            return jsonify(format_error('You are not a member of this league')), 403

        # Build members list with rank movement
        user_leagues = list(UserLeague.objects(league_id=league_id))
        members = []
        for ul in user_leagues:
            member_user = User.objects(id=ul.user_id).first()
            if member_user:
                members.append({
                    'user_id': ul.user_id,
                    'name': f"{member_user.first_name} {member_user.last_name or ''}".strip(),
                    'username': member_user.username or '',
                    'photo_url': member_user.photo_url or None,
                    'rank': ul.rank,
                    'prev_rank': getattr(ul, 'prev_rank', ul.rank),  # fallback to same if no prev
                    'points': ul.points,
                    'is_owner': ul.is_owner,
                })

        # Recent results — top scorer per game week (simplified: from QuizResponse)
        recent_results = []
        try:
            # Get unique game weeks recorded in this league's quiz responses
            # This is a simplified version — adapt to your quiz/gameweek model
            pass
        except Exception:
            pass

        # Final winner — whoever has rank 1 after league end
        final_winner = None
        final_winner_photo = None
        league_ended = datetime.utcnow() > league.end_date if league.end_date else False
        if league_ended:
            top = next((m for m in members if m['rank'] == 1), None)
            if top:
                final_winner = top['name']
                final_winner_photo = top['photo_url']

        return jsonify(format_success(data={
    'id': league.id,
    'name': league.name,
    'description': league.description or '',
    'is_private': league.is_private,
    'code': league.code if my_membership.is_owner else None,
    'total_members': league.total_members,
    'current_game_week': league.current_game_week,      # no more getattr needed
    'total_game_weeks': league.total_game_weeks,         # no more getattr needed
    'start_date': (league.start_date.isoformat() + 'Z') if league.start_date else None,
    'end_date': (league.end_date.isoformat() + 'Z') if league.end_date else None,
    'is_owner': my_membership.is_owner,
    'final_winner': final_winner,
    'final_winner_photo': final_winner_photo,
    'members': members,
    'recent_results': recent_results,
})), 200
        
    except Exception as e:
        return jsonify(format_error(f'Error fetching league detail: {str(e)}')), 500


@league_bp.route('/<league_id>/members/<member_id>', methods=['DELETE'])
@jwt_required()
def remove_member(league_id, member_id):
    """Remove a member from the league (owner only)."""
    try:
        user_id = get_jwt_identity()

        my_membership = UserLeague.objects(user_id=user_id, league_id=league_id).first()
        if not my_membership or not my_membership.is_owner:
            return jsonify(format_error('Only the league owner can remove members')), 403

        if member_id == user_id:
            return jsonify(format_error('You cannot remove yourself')), 400

        target = UserLeague.objects(user_id=member_id, league_id=league_id).first()
        if not target:
            return jsonify(format_error('Member not found')), 404

        target.delete()

        league = League.objects(id=league_id).first()
        if league and league.total_members > 0:
            league.total_members -= 1
            league.save()

        return jsonify(format_success(message='Member removed')), 200

    except Exception as e:
        return jsonify(format_error(f'Error removing member: {str(e)}')), 500


@league_bp.route('/<league_id>/restart', methods=['POST'])
@jwt_required()
def restart_league(league_id):
    """Reset league standings (owner only, only after league ends)."""
    try:
        user_id = get_jwt_identity()

        league = League.objects(id=league_id).first()
        if not league:
            return jsonify(format_error('League not found')), 404

        my_membership = UserLeague.objects(user_id=user_id, league_id=league_id).first()
        if not my_membership or not my_membership.is_owner:
            return jsonify(format_error('Only the league owner can restart it')), 403

        if league.end_date and datetime.utcnow() < league.end_date:
            return jsonify(format_error('League has not ended yet')), 400

        # Reset all member points and ranks
        members = UserLeague.objects(league_id=league_id)
        for i, member in enumerate(members, 1):
            member.points = 0
            member.rank = i
            member.save()

        # Reset league game week
        league.current_game_week = 1
        league.save()

        return jsonify(format_success(message='League restarted successfully')), 200

    except Exception as e:
        return jsonify(format_error(f'Error restarting league: {str(e)}')), 500