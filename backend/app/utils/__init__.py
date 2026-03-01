import hmac
import hashlib
import binascii
import uuid
from datetime import datetime, timedelta
import random
import string


def generate_id() -> str:
    """Generate a unique ID using UUID4"""
    return str(uuid.uuid4())


def format_success(data=None, message: str = 'Success') -> dict:
    """Format a successful API response"""
    response = {
        'success': True,
        'message': message,
    }
    if data is not None:
        response['data'] = data
    return response


def format_error(error: str, status: int = 400) -> dict:
    """Format an error API response"""
    return {
        'success': False,
        'error': error,
        'status': status
    }


def verify_telegram_auth(init_data: str, bot_token: str) -> bool:
    """
    Verify Telegram Web App authentication data
    """
    try:
        # Parse the init data
        data_dict = {}
        for part in init_data.split('&'):
            key, value = part.split('=')
            data_dict[key] = value
        
        # Get the hash
        if 'hash' not in data_dict:
            return False
        
        received_hash = data_dict.pop('hash')
        
        # Create the data check string
        data_check_string = '\n'.join(
            f"{k}={v}" for k, v in sorted(data_dict.items())
        )
        
        # Create the secret key from bot token
        secret_key = hmac.new(
            b'WebAppData',
            msg=bot_token.encode(),
            digestmod=hashlib.sha256
        ).digest()
        
        # Compute the hash
        computed_hash = hmac.new(
            secret_key,
            msg=data_check_string.encode(),
            digestmod=hashlib.sha256
        ).hexdigest()
        
        # Verify the hash
        return computed_hash == received_hash
    except Exception as e:
        print(f"Error verifying Telegram auth: {e}")
        return False


def generate_league_code() -> str:
    """
    Generate a random 6-character alphanumeric code for private leagues
    """
    chars = string.ascii_uppercase + string.digits
    return ''.join(random.choice(chars) for _ in range(6))


def calculate_global_rank(user_id: str) -> tuple[int, int]:
    """
    Calculate user's global rank (returns rank and total users)
    """
    from app.models import User
    
    # Get user's overall score
    user = User.objects(id=user_id).first()
    if not user:
        return 0, 0
    
    # Count how many users have higher scores
    count_higher = User.objects(overall_score__gt=user.overall_score).count()
    rank = count_higher + 1
    total_users = User.objects.count()
    
    return rank, total_users


def update_user_rank(user_id: str):
    """
    Update user's global rank
    """
    from app.models import User
    rank, total = calculate_global_rank(user_id)
    user = User.objects(id=user_id).first()
    if user:
        user.global_rank = rank
        user.global_total_players = total
        user.save()


def update_league_rankings(league_id: str):
    """
    Update rankings within a league
    """
    from app.models import UserLeague, League
    
    # Get all members of the league sorted by points
    members = list(UserLeague.objects(league_id=league_id).order_by('-points'))
    
    # Update their ranks
    for rank, member in enumerate(members, 1):
        member.rank = rank
        member.save()
    
    # Update league member count
    league = League.objects(id=league_id).first()
    if league:
        league.total_members = len(members)
        league.save()


def check_quiz_expiry(expires_at: datetime) -> bool:
    """
    Check if a quiz has expired
    """
    return datetime.utcnow() > expires_at


def calculate_accuracy(correct: int, total: int) -> int:
    """
    Calculate accuracy rate as percentage
    """
    if total == 0:
        return 0
    return int((correct / total) * 100)
