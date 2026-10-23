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
NOTIFICATION_CLAIM_DURATION = timedelta(minutes=1)
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


def _battle_player_name(player, fallback):
    return ' '.join(filter(None, [player.first_name, player.last_name])) or fallback


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


def _notify_battle_quiz_score(battle, response):
    notified_battles = getattr(response, 'battle_notifications_sent', []) or []
    if (
        response.points_earned <= 0
        or battle.id in notified_battles
        or not battle.started_at
        or not battle.expires_at
        or not battle.started_at <= response.completed_at < battle.expires_at
    ):
        return

    quiz = Quiz.objects(id=response.quiz_id).only('destination').first()
    if not quiz or getattr(quiz, 'destination', 'game') == 'tournament':
        return

    players = {
        player.id: player
        for player in User.objects(
            id__in=[battle.challenger_id, battle.opponent_id]
        ).only('id', 'first_name', 'last_name', 'telegram_id')
    }
    if len(players) != 2:
        return

    scorer = players.get(response.user_id)
    if not scorer:
        return

    challenger_score, opponent_score = calculate_battle_scores(battle)
    scorer_name = _battle_player_name(scorer, 'Your opponent')
    challenger_name = _battle_player_name(players[battle.challenger_id], 'Player 1')
    opponent_name = _battle_player_name(players[battle.opponent_id], 'Player 2')
    message = (
        f'⚽ {scorer_name} just played a quiz and scored '
        f'+{response.points_earned} points!\n\n'
        f'Current battle score: {challenger_name} {challenger_score} – '
        f'{opponent_score} {opponent_name}.'
    )

    from app.services.telegram_service import get_telegram_service

    now = datetime.utcnow()
    claim_until = now + NOTIFICATION_CLAIM_DURATION
    claimed_response = QuizResponse.objects(
        id=response.id,
        __raw__={
            '$or': [
                {'battle_notification_claimed_until': {'$exists': False}},
                {'battle_notification_claimed_until': None},
                {'battle_notification_claimed_until': {'$lte': now}},
            ]
        },
    ).modify(
        new=True,
        set__battle_notification_claimed_until=claim_until,
    )
    if not claimed_response:
        return

    service = get_telegram_service()
    sent_to = set(
        getattr(claimed_response, 'battle_notification_sent_to', []) or []
    )
    try:
        for player in players.values():
            notification_key = f'{battle.id}:{player.id}'
            if notification_key in sent_to:
                continue
            if service.send_battle_notification(player.telegram_id, message):
                claimed_response.update(
                    add_to_set__battle_notification_sent_to=notification_key
                )
                sent_to.add(notification_key)

        if all(f'{battle.id}:{player.id}' in sent_to for player in players.values()):
            claimed_response.update(
                add_to_set__battle_notifications_sent=battle.id
            )
    finally:
        QuizResponse.objects(
            id=response.id,
            battle_notification_claimed_until=claim_until,
        ).update(unset__battle_notification_claimed_until=1)


def notify_battle_quiz_score(response):
    if response.points_earned <= 0:
        return

    battles = Battle.objects(
        status='active',
        __raw__={
            '$or': [
                {'challenger_id': response.user_id},
                {'opponent_id': response.user_id},
            ]
        },
    )
    for battle in battles:
        _notify_battle_quiz_score(battle, response)


def _notify_battle_result(battle):
    if battle.result_notification_sent:
        return

    now = datetime.utcnow()
    claim_until = now + NOTIFICATION_CLAIM_DURATION
    claimed_battle = Battle.objects(
        id=battle.id,
        status='completed',
        result_notification_sent=False,
        __raw__={
            '$or': [
                {'result_notification_claimed_until': {'$exists': False}},
                {'result_notification_claimed_until': None},
                {'result_notification_claimed_until': {'$lte': now}},
            ]
        },
    ).modify(
        new=True,
        set__result_notification_claimed_until=claim_until,
    )
    if not claimed_battle:
        return

    players = {
        player.id: player
        for player in User.objects(
            id__in=[battle.challenger_id, battle.opponent_id]
        ).only('id', 'first_name', 'last_name', 'telegram_id')
    }
    if len(players) != 2:
        Battle.objects(
            id=battle.id,
            result_notification_claimed_until=claim_until,
        ).update(unset__result_notification_claimed_until=1)
        return

    challenger = players[battle.challenger_id]
    opponent = players[battle.opponent_id]
    challenger_name = _battle_player_name(challenger, 'Player 1')
    opponent_name = _battle_player_name(opponent, 'Player 2')
    score = (
        f'{challenger_name} {battle.challenger_score} – '
        f'{battle.opponent_score} {opponent_name}'
    )
    if battle.winner_id:
        winner = players[battle.winner_id]
        winner_name = _battle_player_name(winner, 'A player')
        outcome = f'Winner: {winner_name}.'
        challenger_outcome = (
            'You won the battle!' if battle.winner_id == challenger.id
            else f'{winner_name} won the battle.'
        )
        opponent_outcome = (
            'You won the battle!' if battle.winner_id == opponent.id
            else f'{winner_name} won the battle.'
        )
    else:
        outcome = 'The 24-hour battle ended in a draw.'
        challenger_outcome = opponent_outcome = 'The battle ended in a draw.'

    from app.services.telegram_service import get_telegram_service

    service = get_telegram_service()
    messages = {
        challenger.id: f'🏁 1v1 final result\n\n{score}\n{outcome}\n{challenger_outcome}',
        opponent.id: f'🏁 1v1 final result\n\n{score}\n{outcome}\n{opponent_outcome}',
    }
    sent_to = set(
        getattr(claimed_battle, 'result_notification_sent_to', []) or []
    )
    try:
        for player_id, player in players.items():
            if player_id in sent_to:
                continue
            if service.send_battle_notification(
                player.telegram_id,
                messages[player_id],
            ):
                claimed_battle.update(
                    add_to_set__result_notification_sent_to=player_id
                )
                sent_to.add(player_id)

        if len(sent_to) == len(players):
            claimed_battle.update(set__result_notification_sent=True)
    finally:
        Battle.objects(
            id=battle.id,
            result_notification_claimed_until=claim_until,
        ).update(unset__result_notification_claimed_until=1)


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
    for battle in Battle.objects(status='active'):
        responses = QuizResponse.objects(
            user_id__in=[battle.challenger_id, battle.opponent_id],
            points_earned__gt=0,
            completed_at__gte=battle.started_at,
            completed_at__lt=battle.expires_at,
        )
        for response in responses:
            _notify_battle_quiz_score(battle, response)

        if battle.expires_at <= now - SETTLEMENT_GRACE:
            _settle_battle(battle, now)

    for battle in Battle.objects(
        status='completed',
        result_notification_sent=False,
    ):
        _notify_battle_result(battle)
