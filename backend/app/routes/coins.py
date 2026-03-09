from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import User, FootyCoinTask, UserFootyCoinTask, FootyCoinTransaction
from app.utils import generate_id, format_success, format_error
from datetime import datetime
import os
import requests

coins_bp = Blueprint('coins', __name__, url_prefix='/api/footy-coins')

TELEGRAM_BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '')
TELEGRAM_CHANNEL = '@footyriddles'  # or use the channel's numeric ID e.g. -1001234567890


def check_telegram_membership(telegram_id: int) -> bool:
    """
    Ask Telegram's Bot API whether a user is a member of the channel.
    Returns True if the user is a member/admin, False otherwise.
    """
    if not TELEGRAM_BOT_TOKEN:
        return False
    try:
        url = f'https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getChatMember'
        resp = requests.get(url, params={
            'chat_id': TELEGRAM_CHANNEL,
            'user_id': telegram_id,
        }, timeout=5)
        data = resp.json()
        if data.get('ok'):
            status = data['result'].get('status', '')
            return status in ('member', 'administrator', 'creator')
        return False
    except Exception as e:
        print(f'Telegram membership check error: {e}')
        return False


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
    """Complete a footy coin task (watch_ads, free_claim)"""
    try:
        user_id = get_jwt_identity()

        task = FootyCoinTask.objects(id=task_id).first()
        if not task:
            return jsonify(format_error('Task not found')), 404

        # join_telegram must go through /verify-telegram instead
        if task.type == 'join_telegram':
            return jsonify(format_error('Please use the verify-telegram endpoint for this task')), 400

        # Check if already completed (except for repeatable tasks like watch_ads)
        completed = UserFootyCoinTask.objects(user_id=user_id, task_id=task_id).first()
        if completed and task.type != 'watch_ads':
            return jsonify(format_error('Task already completed')), 400

        user = User.objects(id=user_id).first()
        if not user:
            return jsonify(format_error('User not found')), 404

        # Record task completion
        user_task = UserFootyCoinTask(
            id=generate_id(),
            user_id=user_id,
            task_id=task_id,
            completed_at=datetime.utcnow()
        )
        user_task.save()

        # Credit coins
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


@coins_bp.route('/tasks/<task_id>/verify-telegram', methods=['POST'])
@jwt_required()
def verify_telegram_task(task_id):
    """
    Verify the user has joined the Telegram channel before crediting coins.
    The bot calls getChatMember to confirm membership.
    """
    try:
        user_id = get_jwt_identity()

        task = FootyCoinTask.objects(id=task_id).first()
        if not task:
            return jsonify(format_error('Task not found')), 404

        if task.type != 'join_telegram':
            return jsonify(format_error('This endpoint is only for join_telegram tasks')), 400

        # Check if already completed
        completed = UserFootyCoinTask.objects(user_id=user_id, task_id=task_id).first()
        if completed:
            return jsonify(format_error('Task already completed')), 400

        user = User.objects(id=user_id).first()
        if not user:
            return jsonify(format_error('User not found')), 404

        # Verify channel membership via Telegram Bot API
        if not user.telegram_id:
            return jsonify(format_error('No Telegram ID linked to this account')), 400

        is_member = check_telegram_membership(user.telegram_id)
        if not is_member:
            return jsonify(format_error(
                'You have not joined @footyriddles yet. Please join the channel first.'
            )), 400

        # Record task completion
        user_task = UserFootyCoinTask(
            id=generate_id(),
            user_id=user_id,
            task_id=task_id,
            completed_at=datetime.utcnow()
        )
        user_task.save()

        # Credit coins
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
            message='Channel membership verified! Coins credited.'
        )), 200

    except Exception as e:
        return jsonify(format_error(f'Error verifying Telegram membership: {str(e)}')), 500


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


# ---------------------------------------------------------------------------
# Seed helper — run once to insert the three tasks into MongoDB
# ---------------------------------------------------------------------------
def seed_tasks():
    """
    Insert the default tasks if they don't exist yet.
    Call this from your app factory or a CLI command:
        from app.routes.coins import seed_tasks; seed_tasks()
    """
    defaults = [
        {
            'type': 'watch_ads',
            'title': 'Earn 50 Footy Coins',
            'description': 'Watch a short ad without skipping to claim your reward.',
            'reward_coins': 50,
        },
        {
            'type': 'free_claim',
            'title': 'Welcome Bonus',
            'description': 'Claim your one-time welcome gift of 250 Footy Coins.',
            'reward_coins': 250,
        },
        {
            'type': 'join_telegram',
            'title': 'Join Our Telegram Channel',
            'description': 'Join @footyriddles on Telegram and earn 150 Footy Coins.',
            'reward_coins': 150,
        },
    ]

    for task_data in defaults:
        exists = FootyCoinTask.objects(type=task_data['type']).first()
        if not exists:
            task = FootyCoinTask(
                id=generate_id(),
                is_active=True,
                **task_data
            )
            task.save()
            print(f"Seeded task: {task_data['title']}")