from datetime import datetime, timedelta

from app.models import (
    Battle,
    FootyCoinTransaction,
    Quiz,
    QuizResponse,
    User,
)

BATTLE_DURATION = timedelta(hours=24)
SETTLEMENT_GRACE = timedelta(seconds=10)
WIN_REWARD = 150
DRAW_REWARD = 75


def calculate_battle_scores(battle):
    if battle.status not in ('active', 'completed'):
        return 0, 0

    end_at = battle.expires_at or datetime.utcnow()
    quiz_ids = Quiz.objects(__raw__={
        '$or': [
            {'destination': 'game'},
            {'destination': {'$exists': False}},
            {'destination': None},
        ]
    }).distinct('id')
    if not quiz_ids:
        return 0, 0

    totals = {battle.challenger_id: 0, battle.opponent_id: 0}
    responses = QuizResponse.objects(
        user_id__in=list(totals),
        quiz_id__in=quiz_ids,
        completed_at__gte=battle.started_at,
        completed_at__lt=end_at,
    ).only('user_id', 'points_earned')
    for response in responses:
        if response.user_id in totals:
            totals[response.user_id] += response.points_earned or 0
    return totals[battle.challenger_id], totals[battle.opponent_id]


def serialize_battle(battle, viewer_id):
    challenger = User.objects(id=battle.challenger_id).only(
        'id', 'first_name', 'last_name', 'username', 'photo_url'
    ).first()
    opponent = User.objects(id=battle.opponent_id).only(
        'id', 'first_name', 'last_name', 'username', 'photo_url'
    ).first()
    challenger_score, opponent_score = calculate_battle_scores(battle)

    def player_data(player):
        if not player:
            return None
        return {
            'id': player.id,
            'name': ' '.join(filter(None, [player.first_name, player.last_name])),
            'username': player.username,
            'photo_url': player.photo_url,
        }

    viewer_score = (
        challenger_score if viewer_id == battle.challenger_id else opponent_score
    )
    opponent_score_for_viewer = (
        opponent_score if viewer_id == battle.challenger_id else challenger_score
    )
    return {
        'id': battle.id,
        'status': battle.status,
        'challenger': player_data(challenger),
        'opponent': player_data(opponent),
        'challenger_score': challenger_score,
        'opponent_score': opponent_score,
        'my_score': viewer_score,
        'their_score': opponent_score_for_viewer,
        'winner_id': battle.winner_id,
        'coins_awarded': battle.coins_awarded,
        'challenged_at': battle.challenged_at.isoformat() + 'Z',
        'started_at': battle.started_at.isoformat() + 'Z' if battle.started_at else None,
        'expires_at': battle.expires_at.isoformat() + 'Z' if battle.expires_at else None,
        'completed_at': battle.completed_at.isoformat() + 'Z' if battle.completed_at else None,
        'is_challenger': viewer_id == battle.challenger_id,
        'can_respond': battle.status == 'pending' and viewer_id == battle.opponent_id,
    }


def _settle_battle(battle, now):
    if (
        battle.status != 'active'
        or not battle.expires_at
        or battle.expires_at > now - SETTLEMENT_GRACE
    ):
        return

    challenger_score, opponent_score = calculate_battle_scores(battle)
    if challenger_score > opponent_score:
        winner_id = battle.challenger_id
        payouts = {battle.challenger_id: WIN_REWARD}
        coins_awarded = WIN_REWARD
    elif opponent_score > challenger_score:
        winner_id = battle.opponent_id
        payouts = {battle.opponent_id: WIN_REWARD}
        coins_awarded = WIN_REWARD
    else:
        winner_id = None
        payouts = {
            battle.challenger_id: DRAW_REWARD,
            battle.opponent_id: DRAW_REWARD,
        }
        coins_awarded = DRAW_REWARD

    database = Battle._get_db()
    battles = Battle._get_collection()
    users = User._get_collection()
    transactions = FootyCoinTransaction._get_collection()

    def settle_once(session):
        updated = battles.update_one(
            {
                '_id': battle.id,
                'status': 'active',
                'expires_at': {'$lte': now - SETTLEMENT_GRACE},
            },
            {
                '$set': {
                    'status': 'completed',
                    'challenger_score': challenger_score,
                    'opponent_score': opponent_score,
                    'winner_id': winner_id,
                    'coins_awarded': coins_awarded,
                    'completed_at': now,
                }
            },
            session=session,
        )
        if updated.modified_count != 1:
            return

        for user_id, amount in payouts.items():
            user_updated = users.update_one(
                {'_id': user_id},
                {'$inc': {'footy_coins': amount}},
                session=session,
            )
            if user_updated.matched_count != 1:
                raise ValueError(f'Could not award battle coins to user {user_id}')
            transactions.insert_one({
                '_id': f'battle:{battle.id}:{user_id}',
                'user_id': user_id,
                'type': 'reward',
                'amount': amount,
                'reason': f'1v1 battle reward: {battle.id}',
                'created_at': now,
            }, session=session)

    with database.client.start_session() as session:
        session.with_transaction(settle_once)


def sync_battles(now=None):
    now = now or datetime.utcnow()
    pending_cutoff = now - BATTLE_DURATION
    Battle.objects(
        status='pending',
        challenged_at__lte=pending_cutoff,
    ).update(
        set__status='expired',
        set__completed_at=now,
    )
    for battle in Battle.objects(
        status='active',
        expires_at__lte=now - SETTLEMENT_GRACE,
    ):
        _settle_battle(battle, now)
