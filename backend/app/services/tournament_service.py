from datetime import datetime, timedelta

from flask import current_app

from app.models import (
    FootyCoinTransaction,
    Quiz,
    Tournament,
    TournamentFixture,
    TournamentRegistration,
    TournamentSubmission,
    User,
)
from app.utils import generate_id


def build_double_round_robin(participant_ids):
    """Return each head-to-head pairing twice, with the sides reversed."""
    players = list(participant_ids)
    if len(players) % 2:
        players.append(None)

    rounds = len(players) - 1
    rotation = players[:]
    first_leg = []

    for gameweek in range(rounds):
        pairings = []
        for index in range(len(rotation) // 2):
            player_one = rotation[index]
            player_two = rotation[-(index + 1)]
            if gameweek % 2:
                player_one, player_two = player_two, player_one
            pairings.append((player_one, player_two))
        first_leg.append(pairings)
        rotation = [rotation[0], rotation[-1], *rotation[1:-1]]

    return first_leg + [
        [(player_two, player_one) for player_one, player_two in pairings]
        for pairings in first_leg
    ]


def _send_to_users(user_ids, message):
    from app.services.telegram_service import get_telegram_service

    telegram_ids = [
        user.telegram_id
        for user in User.objects(id__in=user_ids).only('telegram_id')
        if user.telegram_id
    ]
    if not telegram_ids:
        return False
    return get_telegram_service().send_tournament_message(telegram_ids, message)


def _refund_registrations(tournament, registrations):
    for registration in registrations:
        user = User.objects(id=registration.user_id).modify(
            new=True,
            inc__footy_coins=tournament.entry_fee,
        )
        if user and tournament.entry_fee:
            FootyCoinTransaction(
                id=generate_id(),
                user_id=user.id,
                type='reward',
                amount=tournament.entry_fee,
                reason=f'Refund: {tournament.name} did not have enough players',
            ).save()


def start_tournament(tournament, now=None):
    now = now or datetime.utcnow()
    registrations = list(
        TournamentRegistration.objects(tournament_id=tournament.id).order_by('joined_at')
    )
    if len(registrations) < 2:
        _refund_registrations(tournament, registrations)
        tournament.status = 'cancelled'
        tournament.registered_count = len(registrations)
        tournament.save()
        _send_to_users(
            [registration.user_id for registration in registrations],
            f'{tournament.name} was cancelled because fewer than two players registered. '
            'Your entry fee has been refunded.',
        )
        return

    participant_ids = [registration.user_id for registration in registrations]
    pairings_by_week = build_double_round_robin(participant_ids)
    tournament.total_gameweeks = len(pairings_by_week)
    TournamentRegistration.objects(tournament_id=tournament.id).update(
        set__renewal_status='current'
    )

    for gameweek, pairings in enumerate(pairings_by_week, start=1):
        scheduled_at = tournament.start_at + timedelta(days=gameweek - 1)
        for player_one_id, player_two_id in pairings:
            is_bye = player_one_id is None or player_two_id is None
            player_id = player_two_id if player_one_id is None else player_one_id
            TournamentFixture(
                id=generate_id(),
                tournament_id=tournament.id,
                gameweek=gameweek,
                player_one_id=player_id if is_bye else player_one_id,
                player_two_id=None if is_bye else player_two_id,
                scheduled_at=scheduled_at,
                closes_at=scheduled_at + timedelta(days=1),
                status='scheduled',
                result='bye' if is_bye else None,
            ).save()

    tournament.status = 'active'
    tournament.registered_count = len(registrations)
    tournament.save()
    _send_to_users(
        participant_ids,
        f'{tournament.name} starts now. Your league fixtures and daily quiz are ready.',
    )


def schedule_tournament_restart(tournament, start_at):
    registrations = list(
        TournamentRegistration.objects(tournament_id=tournament.id).order_by('joined_at')
    )
    if len(registrations) < 2:
        raise ValueError('At least two registered players are required to schedule a restart')

    Quiz.objects(
        destination='tournament',
        tournament_id=tournament.id,
    ).update(set__is_active=False)
    TournamentRegistration.objects(tournament_id=tournament.id).update(
        set__renewal_status='pending'
    )
    tournament.start_at = start_at
    tournament.status = 'renewal'
    tournament.completion_notification_sent = False
    tournament.updated_at = datetime.utcnow()
    tournament.save()

    scheduled_date = start_at.strftime('%B %d, %Y at %H:%M UTC')
    queued = _send_to_users(
        [registration.user_id for registration in registrations],
        f'{tournament.name} is scheduled to restart on {scheduled_date}. '
        f'Open the app to choose whether to continue. The entry fee of '
        f'{tournament.entry_fee} Footy Coins will only be charged if you accept. '
        'Please respond before the restart time.',
    )
    if not queued:
        current_app.logger.warning(
            'Tournament restart scheduled without Telegram notification for %s',
            tournament.id,
        )
    return queued


def start_scheduled_restart(tournament, now=None):
    now = now or datetime.utcnow()
    registrations = list(
        TournamentRegistration.objects(
            tournament_id=tournament.id,
            renewal_status='accepted',
        ).order_by('joined_at')
    )
    TournamentRegistration.objects(
        tournament_id=tournament.id,
        renewal_status__ne='accepted',
    ).delete()
    tournament.registered_count = len(registrations)
    tournament.winner_user_ids = []
    tournament.completion_notification_sent = False
    tournament.updated_at = now
    tournament.save()

    TournamentFixture.objects(tournament_id=tournament.id).delete()
    TournamentSubmission.objects(tournament_id=tournament.id).delete()
    start_tournament(tournament, now)


def _finalize_fixture(tournament, fixture, now):
    if fixture.status != 'scheduled':
        return
    if fixture.player_two_id is None:
        if now >= fixture.closes_at:
            fixture.status = 'completed'
            fixture.save()
        return

    submissions = {
        submission.user_id: submission
        for submission in TournamentSubmission.objects(
            tournament_id=tournament.id,
            gameweek=fixture.gameweek,
        )
    }
    first = submissions.get(fixture.player_one_id)
    second = submissions.get(fixture.player_two_id)
    if not (first and second) and now < fixture.closes_at:
        return

    fixture.player_one_submitted = first is not None
    fixture.player_two_submitted = second is not None
    fixture.player_one_score = first.points_earned if first else 0
    fixture.player_two_score = second.points_earned if second else 0

    if first and second:
        if first.points_earned > second.points_earned:
            fixture.winner_user_id = fixture.player_one_id
            fixture.result = 'win'
        elif second.points_earned > first.points_earned:
            fixture.winner_user_id = fixture.player_two_id
            fixture.result = 'win'
        else:
            fixture.result = 'draw'
    elif first or second:
        fixture.winner_user_id = fixture.player_one_id if first else fixture.player_two_id
        fixture.result = 'forfeit'
    else:
        fixture.result = None

    fixture.status = 'completed'
    fixture.save()
    _notify_fixture_result(fixture)


def _notify_fixture_result(fixture):
    if fixture.result_notification_sent:
        return

    player_ids = [fixture.player_one_id, fixture.player_two_id]
    if not all(player_ids):
        return

    users = {
        user.id: user
        for user in User.objects(id__in=player_ids)
    }
    if len(users) != 2:
        return

    first = users[fixture.player_one_id]
    second = users[fixture.player_two_id]
    if fixture.result == 'draw':
        first_points = second_points = 1
        outcome = 'The fixture is a draw.'
    elif fixture.winner_user_id:
        first_points = 3 if fixture.winner_user_id == first.id else 0
        second_points = 3 if fixture.winner_user_id == second.id else 0
        outcome = (
            f'{users[fixture.winner_user_id].first_name} wins the fixture.'
            if fixture.result == 'win'
            else f'{users[fixture.winner_user_id].first_name} wins by forfeit.'
        )
    else:
        first_points = second_points = 0
        outcome = 'No points were awarded because neither player submitted a quiz.'

    from app.services.telegram_service import get_telegram_service

    service = get_telegram_service()
    first_message = (
        f'GW{fixture.gameweek} result: {first.first_name} {fixture.player_one_score} - '
        f'{fixture.player_two_score} {second.first_name}. {outcome} '
        f'You earned {first_points} league points.'
    )
    second_message = (
        f'GW{fixture.gameweek} result: {first.first_name} {fixture.player_one_score} - '
        f'{fixture.player_two_score} {second.first_name}. {outcome} '
        f'You earned {second_points} league points.'
    )
    sent = service.send_tournament_message([first.telegram_id], first_message)
    sent = service.send_tournament_message([second.telegram_id], second_message) and sent
    if sent:
        fixture.result_notification_sent = True
        fixture.save()


def notify_opponent_score(submission):
    fixture = TournamentFixture.objects(
        tournament_id=submission.tournament_id,
        gameweek=submission.gameweek,
        status__in=['scheduled', 'completed'],
        player_two_id__ne=None,
        __raw__={
            '$or': [
                {'player_one_id': submission.user_id},
                {'player_two_id': submission.user_id},
            ],
        },
    ).first()
    if not fixture:
        return

    opponent_id = (
        fixture.player_two_id
        if fixture.player_one_id == submission.user_id
        else fixture.player_one_id
    )
    opponent = User.objects(id=opponent_id).first()
    if not opponent or not opponent.telegram_id:
        return

    from app.services.telegram_service import get_telegram_service

    scorer = User.objects(id=submission.user_id).first()
    if not scorer:
        return
    opponent_has_submitted = TournamentSubmission.objects(
        tournament_id=submission.tournament_id,
        gameweek=submission.gameweek,
        user_id=opponent_id,
    ).first() is not None
    if fixture.status == 'completed':
        progress = 'The fixture is now final.'
    elif opponent_has_submitted:
        progress = 'Your quiz is submitted; the fixture is awaiting finalization.'
    else:
        progress = 'Complete your quiz before the fixture closes.'
    sent = get_telegram_service().send_tournament_message(
        [opponent.telegram_id],
        f'Your opponent {scorer.first_name} '
        f'scored {submission.points_earned} quiz points in GW{submission.gameweek}. '
        f'{progress}',
    )
    if sent:
        submission.opponent_notified = True
        submission.save()


def calculate_standings(tournament):
    registrations = list(TournamentRegistration.objects(tournament_id=tournament.id))
    users = {
        user.id: user
        for user in User.objects(id__in=[registration.user_id for registration in registrations])
    }
    stats = {
        registration.user_id: {
            'points': 0,
            'matches_played': 0,
            'gameweeks_played': 0,
            'wins': 0,
            'draws': 0,
            'losses': 0,
            'points_for': 0,
            'points_against': 0,
            'point_difference': 0,
        }
        for registration in registrations
    }

    for fixture in TournamentFixture.objects(
        tournament_id=tournament.id,
        status='completed',
    ):
        first_stats = stats.get(fixture.player_one_id)
        if first_stats is None:
            continue
        first_stats['gameweeks_played'] += 1
        if fixture.result == 'bye' or fixture.player_two_id not in stats:
            continue

        second_stats = stats[fixture.player_two_id]
        second_stats['gameweeks_played'] += 1
        if fixture.player_one_submitted or fixture.player_two_submitted:
            first_stats['matches_played'] += 1
            second_stats['matches_played'] += 1
        first_stats['points_for'] += fixture.player_one_score
        first_stats['points_against'] += fixture.player_two_score
        second_stats['points_for'] += fixture.player_two_score
        second_stats['points_against'] += fixture.player_one_score

        if fixture.result == 'draw':
            first_stats['points'] += 1
            second_stats['points'] += 1
            first_stats['draws'] += 1
            second_stats['draws'] += 1
        elif fixture.winner_user_id:
            winner_stats = stats[fixture.winner_user_id]
            loser_id = (
                fixture.player_two_id
                if fixture.winner_user_id == fixture.player_one_id
                else fixture.player_one_id
            )
            winner_stats['points'] += 3
            winner_stats['wins'] += 1
            stats[loser_id]['losses'] += 1

    rows = []
    for user_id, record in stats.items():
        record['point_difference'] = record['points_for'] - record['points_against']
        user = users.get(user_id)
        if user:
            rows.append({
                'user_id': user_id,
                'name': ' '.join(filter(None, [user.first_name, user.last_name])),
                'photo_url': user.photo_url,
                **record,
            })

    rows.sort(
        key=lambda row: (
            -row['points'],
            -row['point_difference'],
            -row['points_for'],
            -row['wins'],
            row['name'].lower(),
        )
    )
    previous_record = None
    current_rank = 0
    for index, row in enumerate(rows, start=1):
        record = (
            row['points'],
            row['point_difference'],
            row['points_for'],
            row['wins'],
        )
        if record != previous_record:
            current_rank = index
            previous_record = record
        row['rank'] = current_rank
    return rows


def finish_tournament(tournament):
    standings = calculate_standings(tournament)
    if standings:
        highest_rank = standings[0]
        tournament.winner_user_ids = [
            row['user_id']
            for row in standings
            if (
                row['points'],
                row['point_difference'],
                row['points_for'],
                row['wins'],
            ) == (
                highest_rank['points'],
                highest_rank['point_difference'],
                highest_rank['points_for'],
                highest_rank['wins'],
            )
        ]
    tournament.status = 'completed'
    tournament.save()
    _notify_tournament_completion(tournament, standings)


def _notify_tournament_completion(tournament, standings=None):
    if not tournament.completion_notification_sent:
        standings = standings or calculate_standings(tournament)
        winners = [
            row['name']
            for row in standings
            if row['user_id'] in tournament.winner_user_ids
        ]
        champion = ', '.join(winners) if winners else 'No champion'
        registrations = TournamentRegistration.objects(tournament_id=tournament.id)
        queued = _send_to_users(
            [registration.user_id for registration in registrations],
            f'{tournament.name} has ended. Season champion: {champion}.',
        )
        if queued:
            tournament.completion_notification_sent = True
            tournament.save()


def sync_tournament(tournament, now=None):
    now = now or datetime.utcnow()
    if tournament.status == 'renewal' and tournament.start_at <= now:
        start_scheduled_restart(tournament, now)
        tournament.reload()

    if tournament.status == 'registration' and tournament.start_at <= now:
        start_tournament(tournament, now)
        tournament.reload()

    if tournament.status == 'completed':
        _notify_tournament_completion(tournament)
        return
    if tournament.status != 'active':
        return

    for submission in TournamentSubmission.objects(
        tournament_id=tournament.id,
        opponent_notified=False,
    ):
        notify_opponent_score(submission)

    for fixture in TournamentFixture.objects(
        tournament_id=tournament.id,
        status='scheduled',
        scheduled_at__lte=now,
    ):
        _finalize_fixture(tournament, fixture, now)

    for fixture in TournamentFixture.objects(
        tournament_id=tournament.id,
        status='completed',
        result_notification_sent=False,
    ):
        _notify_fixture_result(fixture)

    end_at = tournament.start_at + timedelta(days=tournament.total_gameweeks)
    if now >= end_at and not TournamentFixture.objects(
        tournament_id=tournament.id,
        status='scheduled',
    ).first():
        finish_tournament(tournament)


def sync_all_tournaments():
    now = datetime.utcnow()
    for tournament in Tournament.objects(
        status__in=['registration', 'active', 'completed', 'renewal']
    ):
        try:
            sync_tournament(tournament, now)
        except Exception:
            from flask import current_app

            current_app.logger.exception('Could not advance tournament %s', tournament.id)
