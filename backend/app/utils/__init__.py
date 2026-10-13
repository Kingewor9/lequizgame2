import hmac
import hashlib
import binascii
import uuid
from datetime import datetime, timedelta
import random
import string
from urllib.parse import parse_qsl

CAREER_MILESTONES = (
    ('Rookie', 1_000),
    ('Prospect', 5_000),
    ('Academy Graduate', 10_000),
    ('First Team', 50_000),
    ('Playmaker', 100_000),
    ('Worldclass', 250_000),
    ('Hall of Famer', 500_000),
    ('Legend', 1_000_000),
)


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
    if not isinstance(init_data, str) or not bot_token:
        return False

    try:
        data_dict = dict(parse_qsl(init_data, keep_blank_values=True))
        received_hash = data_dict.pop('hash', None)
        if not received_hash:
            return False

        data_check_string = '\n'.join(
            f'{key}={value}' for key, value in sorted(data_dict.items())
        )
        secret_key = hmac.new(
            b'WebAppData',
            msg=bot_token.encode(),
            digestmod=hashlib.sha256
        ).digest()
        computed_hash = hmac.new(
            secret_key,
            msg=data_check_string.encode(),
            digestmod=hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(computed_hash, received_hash)
    except (TypeError, ValueError):
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
        if getattr(user, 'global_rank', 0) > 0 and getattr(user, 'global_rank', 0) != rank:
            user.prev_global_rank = user.global_rank
        elif getattr(user, 'global_rank', 0) == 0:
            user.prev_global_rank = rank
            
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


def record_league_trophy(user_id: str, league_id: str, season: int):
    """Persist a league-season win once so restarts cannot erase it."""
    from app.models import LeagueTrophy

    LeagueTrophy.objects(
        user_id=user_id,
        league_id=league_id,
        season=season
    ).update_one(
        upsert=True,
        set_on_insert__awarded_at=datetime.utcnow()
    )


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
# Allas __init__.py
calculate_quiz_accuracy = calculate_accuracy