from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import User, FootyCoinTask, UserFootyCoinTask, FootyCoinTransaction
from app.utils import generate_id, format_success, format_error
from datetime import datetime

coins_bp = Blueprint('coins', __name__, url_prefix='/api/footy-coins')


@coins_bp.route('/tasks', methods=['GET'])
@jwt_required()
def get_footy_coin_tasks():
    """Get available footy coin tasks"""
    try:
        user_id = get_jwt_identity()
        
        tasks = FootyCoinTask.objects(is_active=True)
        
        result = []
        for task in tasks:
            completed = UserFootyCoinTask.objects(
                user_id=user_id,
                task_id=task.id
            ).first()
            
            result.append({
                'id': task.id,
                'type': task.type,
                'title': task.title,
                'description': task.description,
                'reward_coins': task.reward_coins,
                'is_completed': bool(completed),
                'completed_at': completed.completed_at.isoformat() if completed else None,
            })
        
        return jsonify(format_success(data=result)), 200
    
    except Exception as e:
        return jsonify(format_error(f'Error fetching tasks: {str(e)}')), 500


@coins_bp.route('/tasks/<task_id>/complete', methods=['POST'])
@jwt_required()
def complete_task(task_id):
    """Complete a footy coin task"""
    try:
        user_id = get_jwt_identity()
        
        task = FootyCoinTask.objects(id=task_id).first()
        if not task:
            return jsonify(format_error('Task not found')), 404
        
        # Check if already completed
        completed = UserFootyCoinTask.objects(
            user_id=user_id,
            task_id=task_id
        ).first()
        
        if completed:
            return jsonify(format_error('Task already completed')), 400
        
        user = User.objects(id=user_id).first()
        
        # Record task completion
        user_task = UserFootyCoinTask(
            id=generate_id(),
            user_id=user_id,
            task_id=task_id
        )
        user_task.save()
        
        # Add coins to user
        user.footy_coins += task.reward_coins
        user.save()
        
        # Record transaction
        transaction = FootyCoinTransaction(
            id=generate_id(),
            user_id=user_id,
            type='earned',
            amount=task.reward_coins,
            reason=task.title
        )
        transaction.save()
        
        return jsonify(format_success(
            data={
                'footy_coins': user.footy_coins,
                'coins_earned': task.reward_coins,
            },
            message='Task completed successfully'
        )), 200
    
    except Exception as e:
        return jsonify(format_error(f'Error completing task: {str(e)}')), 500


@coins_bp.route('/balance', methods=['GET'])
@jwt_required()
def get_balance():
    """Get user's footy coin balance"""
    try:
        user_id = get_jwt_identity()
        user = User.objects(id=user_id).first()
        
        if not user:
            return jsonify(format_error('User not found')), 404
        
        return jsonify(format_success(data={'footy_coins': user.footy_coins})), 200
    
    except Exception as e:
        return jsonify(format_error(f'Error fetching balance: {str(e)}')), 500
