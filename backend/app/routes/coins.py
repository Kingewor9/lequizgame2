from flask import Blueprint, current_app, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import (
    FootyCoinTask,
    FootyCoinTransaction,
    StarsCoinPurchase,
    User,
    UserFootyCoinTask,
)
from app.utils import generate_id, format_success, format_error
from datetime import datetime
import secrets
import requests
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

coins_bp = Blueprint('coins', __name__, url_prefix='/api/footy-coins')

TELEGRAM_CHANNEL = '@footyriddles'  # or use the channel's numeric ID e.g. -1001234567890
MAX_STARS_PURCHASE = 10_000_000


@coins_bp.route('/referrals', methods=['GET'])
@jwt_required()
def get_referral_info():
    """Get the authenticated user's invite link and successful referral count."""
    try:
        user = User.objects(id=get_jwt_identity()).first()
        if not user:
            return jsonify(format_error('User not found')), 404

        if not user.referral_code:
            user.referral_code = secrets.token_urlsafe(9)
            user.save()

        miniapp_url = current_app.config.get('MINIAPP_URL', '')
        if not miniapp_url or 'botname/appname' in miniapp_url:
            bot_username = current_app.config.get('TELEGRAM_BOT_USERNAME', '').lstrip('@')
            if not bot_username:
                return jsonify(format_error('Telegram bot username is not configured')), 503
            miniapp_url = f'https://t.me/{bot_username}'

        parts = urlsplit(miniapp_url)
        query = dict(parse_qsl(parts.query, keep_blank_values=True))
        query['startapp'] = f'ref_{user.referral_code}'
        referral_link = urlunsplit((
            parts.scheme,
            parts.netloc,
            parts.path,
            urlencode(query),
            parts.fragment,
        ))

        return jsonify(format_success(data={
            'referral_code': user.referral_code,
            'referral_link': referral_link,
            'successful_referrals': len(user.referred_user_ids or []),
            'reward_per_referral': 10,
        })), 200
    except Exception as e:
        return jsonify(format_error(f'Error fetching referral information: {str(e)}')), 500


def telegram_bot_api(method: str, payload: dict) -> dict:
    """Make a Bot API request and surface Telegram errors to the caller."""
    bot_token = current_app.config.get('TELEGRAM_BOT_TOKEN')
    if not bot_token:
        raise RuntimeError('Telegram bot is not configured')

    response = requests.post(
        f'https://api.telegram.org/bot{bot_token}/{method}',
        json=payload,
        timeout=10,
    )
    result = response.json()
    if not response.ok or not result.get('ok'):
        raise RuntimeError(result.get('description') or f'Telegram {method} request failed')
    return result


def check_telegram_membership(telegram_id: int) -> bool:
    """
    Ask Telegram's Bot API whether a user is a member of the channel.
    Returns True if the user is a member/admin, False otherwise.
    """
    bot_token = current_app.config.get('TELEGRAM_BOT_TOKEN')
    if not bot_token:
        return False
    try:
        url = f'https://api.telegram.org/bot{bot_token}/getChatMember'
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


@coins_bp.route('/stars/purchase', methods=['POST'])
@jwt_required()
def create_stars_purchase():
    """Create a server-priced Telegram Stars invoice for Footy Coins."""
    try:
        user_id = get_jwt_identity()
        user = User.objects(id=user_id).first()
        if not user:
            return jsonify(format_error('User not found')), 404

        data = request.get_json(silent=True) or {}
        amount = data.get('amount')
        if isinstance(amount, bool) or not isinstance(amount, int):
            return jsonify(format_error('Enter a whole number of Footy Coins')), 400
        if amount < 1 or amount > MAX_STARS_PURCHASE:
            return jsonify(format_error(
                f'Choose an amount between 1 and {MAX_STARS_PURCHASE:,} Footy Coins'
            )), 400

        purchase_id = generate_id()
        invoice_payload = generate_id()
        purchase = StarsCoinPurchase(
            id=purchase_id,
            user_id=user.id,
            telegram_id=user.telegram_id,
            invoice_payload=invoice_payload,
            amount=amount,
        )
        purchase.save()

        try:
            invoice_result = telegram_bot_api('createInvoiceLink', {
                'title': f'{amount:,} Footy Coins',
                'description': f'Add {amount:,} Footy Coins to your Footy IQ balance.',
                'payload': invoice_payload,
                'currency': 'XTR',
                'prices': [{'label': 'Footy Coins', 'amount': amount}],
            })
        except Exception:
            purchase.delete()
            raise

        return jsonify(format_success(data={
            'purchase_id': purchase_id,
            'invoice_url': invoice_result['result'],
            'amount': amount,
            'stars': amount,
        })), 201

    except Exception as e:
        current_app.logger.exception('Error creating Telegram Stars invoice')
        return jsonify(format_error(f'Could not create Stars invoice: {str(e)}')), 502


@coins_bp.route('/stars/purchases/<purchase_id>', methods=['GET'])
@jwt_required()
def get_stars_purchase(purchase_id):
    """Return the payment status for one of the current user's purchases."""
    purchase = StarsCoinPurchase.objects(id=purchase_id, user_id=get_jwt_identity()).first()
    if not purchase:
        return jsonify(format_error('Purchase not found')), 404

    return jsonify(format_success(data={
        'status': purchase.status,
        'amount': purchase.amount,
    })), 200


@coins_bp.route('/telegram-webhook', methods=['POST'])
def telegram_payment_webhook():
    """Handle Telegram Stars pre-checkout queries and successful payments."""
    webhook_secret = current_app.config.get('TELEGRAM_WEBHOOK_SECRET', '')
    if not webhook_secret:
        current_app.logger.error('Telegram payment webhook secret is not configured')
        return jsonify(format_error('Payment webhook is not configured')), 503

    received_secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token', '')
    if not secrets.compare_digest(received_secret, webhook_secret):
        return jsonify(format_error('Unauthorized webhook request')), 403

    update = request.get_json(silent=True) or {}
    pre_checkout = update.get('pre_checkout_query')
    if pre_checkout:
        purchase = StarsCoinPurchase.objects(
            invoice_payload=pre_checkout.get('invoice_payload'),
            telegram_id=pre_checkout.get('from', {}).get('id'),
            amount=pre_checkout.get('total_amount'),
            status='pending',
        ).first()
        allowed = bool(purchase and pre_checkout.get('currency') == 'XTR')
        answer = {
            'pre_checkout_query_id': pre_checkout['id'],
            'ok': allowed,
        }
        if not allowed:
            answer['error_message'] = 'This Stars invoice is invalid or has expired.'
        try:
            telegram_bot_api('answerPreCheckoutQuery', answer)
        except Exception as e:
            current_app.logger.exception('Could not answer Telegram pre-checkout query')
            return jsonify(format_error(str(e))), 502

    message = update.get('message') or {}
    payment = message.get('successful_payment')
    if payment:
        payer_id = message.get('from', {}).get('id')
        payload = payment.get('invoice_payload')
        charge_id = payment.get('telegram_payment_charge_id')
        if (
            not payer_id
            or not payload
            or not charge_id
            or payment.get('currency') != 'XTR'
        ):
            return jsonify(format_error('Invalid Telegram Stars payment update')), 400

        database = StarsCoinPurchase._get_db()
        FootyCoinTransaction.ensure_indexes()
        purchase_collection = StarsCoinPurchase._get_collection()
        user_collection = User._get_collection()
        transaction_collection = FootyCoinTransaction._get_collection()

        def credit_payment(session):
            purchase = purchase_collection.find_one(
                {'invoice_payload': payload},
                session=session,
            )
            if not purchase:
                raise ValueError('Stars invoice payload was not recognized')
            if purchase['telegram_id'] != payer_id:
                raise ValueError('Stars payment user does not match the invoice')
            if purchase['amount'] != payment.get('total_amount'):
                raise ValueError('Stars payment amount does not match the invoice')
            if purchase['status'] == 'paid':
                return
            if purchase['status'] != 'pending':
                raise ValueError('Stars invoice is not payable')

            balance_update = user_collection.update_one(
                {'_id': purchase['user_id'], 'telegram_id': payer_id},
                {'$inc': {'footy_coins': purchase['amount']}},
                session=session,
            )
            if balance_update.matched_count != 1:
                raise ValueError('The player for this Stars invoice was not found')

            now = datetime.utcnow()
            transaction_collection.insert_one({
                '_id': generate_id(),
                'user_id': purchase['user_id'],
                'type': 'purchased',
                'amount': purchase['amount'],
                'reason': f"Telegram Stars purchase ({charge_id})",
                'telegram_payment_charge_id': charge_id,
                'created_at': now,
            }, session=session)
            purchase_collection.update_one(
                {'_id': purchase['_id'], 'status': 'pending'},
                {'$set': {
                    'status': 'paid',
                    'telegram_payment_charge_id': charge_id,
                    'paid_at': now,
                }},
                session=session,
            )

        try:
            with database.client.start_session() as session:
                session.with_transaction(credit_payment)
        except Exception as e:
            current_app.logger.exception('Could not credit Telegram Stars payment')
            return jsonify(format_error(f'Could not process Stars payment: {str(e)}')), 500

    return jsonify({'ok': True}), 200


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