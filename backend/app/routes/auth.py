from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import create_access_token
from app.models import AppLaunch, FootyCoinTransaction, User
from app.utils import generate_id, format_success, format_error, verify_telegram_auth
from app.services.telegram_service import get_telegram_service
from datetime import datetime
import json
import secrets
from uuid import UUID
from urllib.parse import parse_qsl

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')

REFERRAL_REWARD = 10


def _get_verified_referral_code(init_data, telegram_id):
    """Return a referral code only when Telegram signed the Mini App launch data."""
    if not init_data:
        return None

    fields = dict(parse_qsl(init_data, keep_blank_values=True))
    start_param = fields.get('start_param', '')
    if not start_param.startswith('ref_'):
        return None

    bot_token = current_app.config.get('TELEGRAM_BOT_TOKEN', '')
    if not verify_telegram_auth(init_data, bot_token):
        raise ValueError('Could not verify the Telegram referral link.')

    try:
        signed_user = json.loads(fields.get('user', '{}'))
    except (TypeError, json.JSONDecodeError) as error:
        raise ValueError('Could not verify the Telegram referral link.') from error

    if str(signed_user.get('id')) != str(telegram_id):
        raise ValueError('Could not verify the Telegram referral link.')

    referral_code = start_param[4:]
    if not referral_code or len(referral_code) > 64:
        return None
    return referral_code


def _is_verified_telegram_launch(init_data, telegram_id):
    bot_token = current_app.config.get('TELEGRAM_BOT_TOKEN', '')
    if not verify_telegram_auth(init_data, bot_token):
        return False

    try:
        fields = dict(parse_qsl(init_data, keep_blank_values=True))
        signed_user = json.loads(fields.get('user', '{}'))
    except (TypeError, json.JSONDecodeError):
        return False

    return str(signed_user.get('id')) == str(telegram_id)


def _complete_referral_reward(user):
    """Credit a linked invite once, even if Telegram login is retried."""
    referrer_id = getattr(user, 'referred_by_id', None)
    if not referrer_id:
        return

    referrer = User.objects(id=referrer_id).first()
    if not referrer:
        return

    rewarded = User.objects(
        id=referrer_id,
        referred_user_ids__ne=user.id,
    ).update_one(
        add_to_set__referred_user_ids=user.id,
        inc__footy_coins=REFERRAL_REWARD,
        set__updated_at=datetime.utcnow(),
    )
    if not rewarded:
        return

    try:
        FootyCoinTransaction(
            id=f'referral_{user.id}',
            user_id=referrer_id,
            type='earned',
            amount=REFERRAL_REWARD,
            reason='Successful referral',
        ).save()
    except Exception:
        current_app.logger.exception('Could not record referral coin transaction')

    get_telegram_service().send_bulk_notifications(
        [referrer.telegram_id],
        f'🎉 Your invite just joined Footy IQ! {REFERRAL_REWARD} Footy Coins have been added to your balance.',
    )


@auth_bp.route('/telegram-login', methods=['POST'])
def telegram_login():
    """Authenticate user via Telegram"""
    try:
        data = request.get_json() or {}
        
        # Validate required fields
        required_fields = ['telegram_id', 'first_name']
        for field in required_fields:
            if field not in data:
                return jsonify(format_error(f'Missing field: {field}')), 400
        
        telegram_id = data.get('telegram_id')
        first_name = data.get('first_name')
        last_name = data.get('last_name')
        username = data.get('username')
        photo_url = data.get('photo_url')
        referral_code = _get_verified_referral_code(
            data.get('init_data'), telegram_id
        )
        
        # Check if user exists
        user = User.objects(telegram_id=telegram_id).first()
        
        if not user:
            # Create new user
            user = User(
                id=generate_id(),
                telegram_id=telegram_id,
                first_name=first_name,
                last_name=last_name,
                username=username,
                photo_url=photo_url,
                footy_coins=0,
                overall_score=0,
                global_rank=0,
                global_total_players=0,
                referral_code=secrets.token_urlsafe(9),
            )
            user.save()
        else:
            # Telegram profile details can change after the account is created.
            user.first_name = first_name
            user.last_name = last_name
            user.username = username
            user.photo_url = photo_url
            user.updated_at = datetime.utcnow()
            user.save()

        if referral_code and not getattr(user, 'referred_by_id', None):
            referrer = User.objects(referral_code=referral_code).first()
            if referrer and referrer.id != user.id:
                User.objects(
                    id=user.id,
                    referred_by_id__in=[None, ''],
                ).update_one(set__referred_by_id=referrer.id)
                user.reload()

        _complete_referral_reward(user)

        launch_id = data.get('launch_id')
        if launch_id and _is_verified_telegram_launch(data.get('init_data'), telegram_id):
            try:
                launch_id = str(UUID(launch_id))
            except (TypeError, ValueError, AttributeError):
                current_app.logger.warning(
                    'Skipping Telegram welcome for user %s because launch ID is invalid',
                    user.id,
                )
            else:
                AppLaunch.objects(launch_id=launch_id).update_one(
                    upsert=True,
                    set_on_insert__id=launch_id,
                    set_on_insert__user_id=user.id,
                    set_on_insert__launched_at=datetime.utcnow(),
                )
                claimed_launch = User.objects(
                    id=user.id,
                    last_welcome_launch_id__ne=launch_id,
                ).update_one(set__last_welcome_launch_id=launch_id)
                if claimed_launch:
                    sent = get_telegram_service().send_welcome_message(
                        user.telegram_id,
                        user.first_name,
                    )
                    if not sent:
                        current_app.logger.warning(
                            'Telegram welcome could not be delivered to user %s',
                            user.id,
                        )
        elif launch_id:
            current_app.logger.warning(
                'Skipping Telegram welcome for user %s because launch data could not be verified',
                user.id,
            )
        
        # Generate JWT token
        access_token = create_access_token(identity=user.id)
        
        
        # Check if user is an admin
        is_admin = telegram_id in current_app.config.get('ADMIN_TELEGRAM_IDS', [])
        
        return jsonify(format_success(
            data={
                **user.to_dict(),
                'is_admin': is_admin,
                'access_token': access_token
            },
            message='Login successful'
        )), 200
    
    except ValueError as e:
        return jsonify(format_error(str(e))), 400
    except Exception as e:
        return jsonify(format_error(f'Authentication failed: {str(e)}')), 500


@auth_bp.route('/logout', methods=['POST'])
def logout():
    """Logout user"""
    # In a real app, you might invalidate the token here
    return jsonify(format_success(message='Logout successful')), 200
