from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import User, FootyCoinTransaction
from app.utils import generate_id, format_success, format_error, calculate_global_rank

user_bp = Blueprint('user', __name__, url_prefix='/api/users')


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
        
        return jsonify(format_success(data=user.to_dict())), 200
    
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


@user_bp.route('/<user_id>/leaderboard', methods=['GET'])
@jwt_required()
def get_leaderboard(user_id):
    """Get global leaderboard"""
    try:
        limit = request.args.get('limit', 100, type=int)
        
        users = User.objects.order_by('-overall_score').limit(limit)
        
        leaderboard = []
        for idx, u in enumerate(users, 1):
            leaderboard.append({
                'rank': idx,
                'user': u.to_dict(),
                'score': u.overall_score
            })
        
        return jsonify(format_success(data=leaderboard)), 200
    
    except Exception as e:
        return jsonify(format_error(f'Error fetching leaderboard: {str(e)}')), 500
