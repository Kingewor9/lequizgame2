from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token
from app.models import User
from app.utils import generate_id, format_success, format_error
from datetime import datetime

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')


@auth_bp.route('/telegram-login', methods=['POST'])
def telegram_login():
    """Authenticate user via Telegram"""
    try:
        data = request.get_json()
        
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
                global_total_players=0
            )
            user.save()
        
        # Generate JWT token
        access_token = create_access_token(identity=user.id)
        
        return jsonify(format_success(
            data={
                **user.to_dict(),
                'access_token': access_token
            },
            message='Login successful'
        )), 200
    
    except Exception as e:
        return jsonify(format_error(f'Authentication failed: {str(e)}')), 500


@auth_bp.route('/logout', methods=['POST'])
def logout():
    """Logout user"""
    # In a real app, you might invalidate the token here
    return jsonify(format_success(message='Logout successful')), 200
