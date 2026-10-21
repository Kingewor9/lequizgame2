from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime
from app.models import (
    User,
    FootyCoinTransaction,
    League,
    LeagueTrophy,
    MilestoneAchievement,
    TournamentAward,
    UserLeague,
    Battle,
)
from app.utils import (
    calculate_global_rank,
    format_error,
    format_success,
    generate_id,
    record_league_trophy,
)

user_bp = Blueprint('user', __name__, url_prefix='/api/users')


@user_bp.route('/milestones/claim', methods=['POST'])
@jwt_required()
def claim_milestone_notification():
    """Return and mark the next unseen career milestone for the signed-in user."""
    try:
        user_id = get_jwt_identity()

        for _ in range(3):
            pending_milestones = MilestoneAchievement.objects(
                user_id=user_id,
                shown_at=None,
            ).order_by('achieved_at').limit(20)

            for milestone in pending_milestones:
                claimed = MilestoneAchievement.objects(
                    id=milestone.id,
                    user_id=user_id,
                    shown_at=None,
                ).update_one(set__shown_at=datetime.utcnow())
                if claimed:
                    return jsonify(format_success(data={
                        'milestone': {
                            'id': milestone.id,
                            'title': milestone.title,
                            'points': milestone.points,
                        }
                    })), 200

        return jsonify(format_success(data={'milestone': None})), 200

    except Exception as e:
        current_app.logger.exception('Error claiming milestone notification')
        return jsonify(format_error(f'Error claiming milestone: {str(e)}')), 500


def _record_ended_league_wins(user_id):
    now = datetime.utcnow()
    ended_leagues = list(League.objects(end_date__lte=now))
    ended_leagues_by_id = {league.id: league for league in ended_leagues}
    ended_league_ids = list(ended_leagues_by_id)
    current_wins = UserLeague.objects(
        user_id=user_id, league_id__in=ended_league_ids, rank=1
    )

    for membership in current_wins:
        league = ended_leagues_by_id[membership.league_id]
        record_league_trophy(
            user_id,
            league.id,
            getattr(league, 'season', 1) or 1
        )


@user_bp.route('/leaderboard/global', methods=['GET'])
@jwt_required()
def get_global_leaderboard():
    """Get global leaderboard for all users"""
    try:
        limit = request.args.get('limit', 100, type=int)
        
        users = User.objects.order_by('-overall_score').limit(limit)
        
        leaderboard = []
        for idx, u in enumerate(users, 1):
            u_dict = u.to_dict()
            u_dict['is_admin'] = u.telegram_id in current_app.config.get('ADMIN_TELEGRAM_IDS', [])
            
            leaderboard.append({
                'rank': idx,
                'prev_rank': getattr(u, 'prev_global_rank', idx),
                'user': u_dict,
                'score': u.overall_score
            })
        
        return jsonify(format_success(data=leaderboard)), 200
    
    except Exception as e:
        return jsonify(format_error(f'Error fetching global leaderboard: {str(e)}')), 500


@user_bp.route('/league-wins/claim', methods=['POST'])
@jwt_required()
def claim_league_win():
    """Return and mark the next unseen league-season win for the signed-in user."""
    try:
        user_id = get_jwt_identity()
        _record_ended_league_wins(user_id)

        for _ in range(3):
            pending_wins = LeagueTrophy.objects(
                user_id=user_id, shown_at=None
            ).order_by('awarded_at').limit(20)

            for trophy in pending_wins:
                league = League.objects(id=trophy.league_id).first()
                if not league:
                    current_app.logger.warning(
                        'Skipping league trophy %s because league %s no longer exists',
                        trophy.id,
                        trophy.league_id,
                    )
                    LeagueTrophy.objects(
                        id=trophy.id, user_id=user_id, shown_at=None
                    ).update_one(set__shown_at=datetime.utcnow())
                    continue

                claimed = LeagueTrophy.objects(
                    id=trophy.id, user_id=user_id, shown_at=None
                ).update_one(set__shown_at=datetime.utcnow())
                if claimed:
                    return jsonify(format_success(data={
                        'win': {
                            'id': trophy.id,
                            'league_id': league.id,
                            'league_name': league.name,
                            'season': trophy.season,
                            'awarded_at': trophy.awarded_at.isoformat() + 'Z',
                        }
                    })), 200

        return jsonify(format_success(data={'win': None})), 200

    except Exception as e:
        current_app.logger.exception('Error claiming league win notification')
        return jsonify(format_error(f'Error claiming league win: {str(e)}')), 500


@user_bp.route('/<user_id>', methods=['GET'])
@jwt_required()
def get_user(user_id):
    """Get user profile"""
    try:
        user = User.objects(id=user_id).first()
        
        if not user:
            return jsonify(format_error('User not found')), 404
        
        # Calculate global rank
        rank, total = calculate_global_rank(user_id)
        user.global_rank = rank
        user.global_total_players = total
        user.save()
        
        user_dict = user.to_dict()
        user_dict['is_admin'] = user.telegram_id in current_app.config.get('ADMIN_TELEGRAM_IDS', [])
        _record_ended_league_wins(user_id)
        user_dict['league_wins'] = LeagueTrophy.objects(user_id=user_id).count()
        user_dict['tournament_wins'] = TournamentAward.objects(
            user_id=user_id,
            place=1,
        ).count()
        completed_battles = Battle.objects(
            status='completed',
            __raw__={
                '$or': [
                    {'challenger_id': user_id},
                    {'opponent_id': user_id},
                ]
            },
        )
        battle_wins = battle_draws = 0
        battle_played = completed_battles.count()
        for battle in completed_battles:
            if battle.winner_id is None:
                battle_draws += 1
            elif battle.winner_id == user_id:
                battle_wins += 1
        user_dict['battle_record'] = {
            'played': battle_played,
            'won': battle_wins,
            'lost': battle_played - battle_wins - battle_draws,
            'drawn': battle_draws,
        }
        
        return jsonify(format_success(data=user_dict)), 200
    
    except Exception as e:
        return jsonify(format_error(f'Error fetching user: {str(e)}')), 500


@user_bp.route('/spend-coins', methods=['POST'])
@jwt_required()
def spend_coins():
    """Spend footy coins"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        
        amount = data.get('amount', 0)
        reason = data.get('reason', 'Transaction')
        
        if amount <= 0:
            return jsonify(format_error('Invalid amount')), 400
        
        user = User.objects(id=user_id).first()
        
        if not user:
            return jsonify(format_error('User not found')), 404
        
        if user.footy_coins < amount:
            return jsonify(format_error('Insufficient footy coins')), 400
        
        # Deduct coins
        user.footy_coins -= amount
        user.save()
        
        # Record transaction
        transaction = FootyCoinTransaction(
            id=generate_id(),
            user_id=user_id,
            type='spent',
            amount=amount,
            reason=reason
        )
        transaction.save()
        
        return jsonify(format_success(
            data={'footy_coins': user.footy_coins},
            message='Coins spent successfully'
        )), 200
    
    except Exception as e:
        return jsonify(format_error(f'Error spending coins: {str(e)}')), 500


@user_bp.route('/leaderboard/search', methods=['GET'])
@jwt_required()
def search_global_leaderboard():
    """Search users by username or name and return their leaderboard rank."""
    try:
        q = (request.args.get('q', '') or '').strip()
        if not q:
            return jsonify(format_success(data=[])), 200

        users = User.objects(
            __raw__={
                '$or': [
                    {'first_name': {'$regex': q, '$options': 'i'}},
                    {'last_name': {'$regex': q, '$options': 'i'}},
                    {'username': {'$regex': q, '$options': 'i'}},
                ]
            }
        )

        matches = []
        for user in users:
            rank = User.objects(overall_score__gt=user.overall_score).count() + 1
            user_dict = user.to_dict()
            user_dict['is_admin'] = user.telegram_id in current_app.config.get('ADMIN_TELEGRAM_IDS', [])
            matches.append({
                'rank': rank,
                'prev_rank': getattr(user, 'prev_global_rank', rank),
                'user': user_dict,
                'score': user.overall_score,
            })

        matches.sort(key=lambda entry: (
            entry['rank'],
            (entry['user'].get('first_name') or '').lower(),
            (entry['user'].get('last_name') or '').lower(),
            (entry['user'].get('username') or '').lower()
        ))

        return jsonify(format_success(data=matches[:10])), 200

    except Exception as e:
        return jsonify(format_error(f'Error searching leaderboard: {str(e)}')), 500


@user_bp.route('/<user_id>/leaderboard', methods=['GET'])
@jwt_required()
def get_leaderboard(user_id):
    """Get global leaderboard"""
    try:
        limit = request.args.get('limit', 100, type=int)
        
        users = User.objects.order_by('-overall_score').limit(limit)
        
        leaderboard = []
        for idx, u in enumerate(users, 1):
            u_dict = u.to_dict()
            u_dict['is_admin'] = u.telegram_id in current_app.config.get('ADMIN_TELEGRAM_IDS', [])
            
            leaderboard.append({
                'rank': idx,
                'user': u_dict,
                'score': u.overall_score
            })
        
        return jsonify(format_success(data=leaderboard)), 200
    
    except Exception as e:
        return jsonify(format_error(f'Error fetching leaderboard: {str(e)}')), 500
