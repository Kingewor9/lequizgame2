from datetime import datetime, timedelta
import secrets

from flask import current_app

from app.models import (
    FootyCoinTransaction,
    Quiz,
    Tournament,
    TournamentAward,
    TournamentFixture,
    TournamentRegistration,
    TournamentSubmission,
    User,
)
from app.utils import generate_id


GROUP_NAMES = tuple('ABCDEFGH')
KNOCKOUT_ROUNDS = (
    ('Round of 16', 7, 8),
    ('Quarter-finals', 8, 4),
    ('Semi-finals', 9, 2),
    ('Final', 10, 1),
)


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


def _save_group_fixture(tournament, gameweek, player_one_id, player_two_id, group_name, leg):
    scheduled_at = tournament.start_at + timedelta(days=gameweek - 1)
    TournamentFixture(
        id=generate_id(),
        tournament_id=tournament.id,
        gameweek=gameweek,
        stage='group',
        group_name=group_name,
        round_name='Group stage',
        leg=leg,
        player_one_id=player_one_id,
        player_two_id=player_two_id,
        scheduled_at=scheduled_at,
        closes_at=scheduled_at + timedelta(days=1),
        status='scheduled',
    ).save()


def _start_group_knockout_tournament(tournament, now):
    registrations = list(
        TournamentRegistration.objects(tournament_id=tournament.id).order_by('joined_at')
    )
    if len(registrations) != 32 or tournament.status == 'cancelling':
        cancelling = Tournament.objects(
            id=tournament.id,
            status='registration',
            start_at__lte=now,
        ).modify(
            new=True,
            set__status='cancelling',
            set__registered_count=len(registrations),
            set__updated_at=now,
        )
        if not cancelling and tournament.status != 'cancelling':
            return
        registrations = list(
            TournamentRegistration.objects(tournament_id=tournament.id).order_by('joined_at')
        )
        if not cancelling or len(registrations) != 32:
            Tournament.objects(id=tournament.id, status='cancelling').update_one(
                set__registered_count=len(registrations),
            )
            refund_tournament_registrations(tournament, registrations)
            cancelled = Tournament.objects(
                id=tournament.id,
                status='cancelling',
            ).modify(
                new=True,
                set__status='cancelled',
                set__updated_at=datetime.utcnow(),
            )
            if cancelled:
                _send_to_users(
                    [registration.user_id for registration in registrations],
                    f'{tournament.name} was cancelled because all 32 places were not filled. '
                    'Your entry fee has been refunded.',
                )
            return

        starting = Tournament.objects(
            id=tournament.id,
            status='cancelling',
            start_at__lte=now,
        ).modify(new=True, set__status='starting', set__updated_at=now)
    else:
        starting = Tournament.objects(
            id=tournament.id,
            status='registration',
            start_at__lte=now,
        ).modify(new=True, set__status='starting', set__updated_at=now)
    if not starting:
        return

    try:
        shuffled_registrations = registrations[:]
        secrets.SystemRandom().shuffle(shuffled_registrations)
        groups = {
            group_name: shuffled_registrations[index * 4:(index + 1) * 4]
            for index, group_name in enumerate(GROUP_NAMES)
        }

        TournamentFixture.objects(tournament_id=tournament.id).delete()
        for group_name, group_registrations in groups.items():
            for registration in group_registrations:
                registration.group_name = group_name
                registration.draw_lot = secrets.randbelow(2**31)
                registration.save()

            schedule = build_double_round_robin(
                [registration.user_id for registration in group_registrations]
            )
            for gameweek, pairings in enumerate(schedule, start=1):
                leg = 1 if gameweek <= 3 else 2
                for player_one_id, player_two_id in pairings:
                    _save_group_fixture(
                        tournament,
                        gameweek,
                        player_one_id,
                        player_two_id,
                        group_name,
                        leg,
                    )

        tournament.total_gameweeks = 10
        tournament.registered_count = 32
        tournament.status = 'active'
        tournament.updated_at = now
        tournament.save()
    except Exception:
        TournamentFixture.objects(tournament_id=tournament.id).delete()
        TournamentRegistration.objects(tournament_id=tournament.id).update(
            unset__group_name=1,
            set__draw_lot=0,
        )
        Tournament.objects(id=tournament.id, status='starting').update_one(
            set__status='registration',
            set__updated_at=datetime.utcnow(),
        )
        raise
    try:
        _send_to_users(
            [registration.user_id for registration in registrations],
            f'{tournament.name} starts now. The group stage features six home-and-away rounds.',
        )
    except Exception:
        current_app.logger.exception(
            'Could not notify players that group tournament %s started',
            tournament.id,
        )


def _group_fixture_stats(tournament, group_name):
    registrations = list(TournamentRegistration.objects(
        tournament_id=tournament.id,
        group_name=group_name,
    ))
    users = {
        user.id: user
        for user in User.objects(id__in=[registration.user_id for registration in registrations])
    }
    registration_by_id = {registration.user_id: registration for registration in registrations}
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
    fixtures = list(TournamentFixture.objects(
        tournament_id=tournament.id,
        stage='group',
        group_name=group_name,
        status='completed',
    ))
    for fixture in fixtures:
        first_stats = stats.get(fixture.player_one_id)
        second_stats = stats.get(fixture.player_two_id)
        if not first_stats or not second_stats:
            continue
        first_stats['gameweeks_played'] += 1
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
        elif fixture.winner_user_id == fixture.player_one_id:
            first_stats['points'] += 3
            first_stats['wins'] += 1
            second_stats['losses'] += 1
        elif fixture.winner_user_id == fixture.player_two_id:
            second_stats['points'] += 3
            second_stats['wins'] += 1
            first_stats['losses'] += 1

    rows = []
    for user_id, record in stats.items():
        record['point_difference'] = record['points_for'] - record['points_against']
        user = users.get(user_id)
        if user:
            rows.append({
                'user_id': user_id,
                'name': ' '.join(filter(None, [user.first_name, user.last_name])),
                'photo_url': user.photo_url,
                'group_name': group_name,
                'draw_lot': registration_by_id[user_id].draw_lot,
                **record,
            })

    tied_groups = {}
    for row in rows:
        primary_record = (
            row['points'],
            row['point_difference'],
            row['points_for'],
        )
        tied_groups.setdefault(primary_record, set()).add(row['user_id'])
    for row in rows:
        tied_user_ids = tied_groups[(
            row['points'],
            row['point_difference'],
            row['points_for'],
        )]
        head_to_head_points = 0
        if len(tied_user_ids) > 1:
            for fixture in fixtures:
                if fixture.player_one_id != row['user_id'] or fixture.player_two_id not in tied_user_ids:
                    if fixture.player_two_id != row['user_id'] or fixture.player_one_id not in tied_user_ids:
                        continue
                if fixture.result == 'draw':
                    head_to_head_points += 1
                elif fixture.winner_user_id == row['user_id']:
                    head_to_head_points += 3
        row['head_to_head_points'] = head_to_head_points

    rows.sort(key=lambda row: (
        -row['points'],
        -row['point_difference'],
        -row['points_for'],
        -row['head_to_head_points'],
        row['draw_lot'],
        row['name'].lower(),
    ))
    for index, row in enumerate(rows, start=1):
        row['rank'] = index
    return rows


def _round_of_16_pairings(tournament):
    groups = {
        group_name: _group_fixture_stats(tournament, group_name)
        for group_name in GROUP_NAMES
    }
    winners = [rows[0] for rows in groups.values() if len(rows) == 4]
    runners_up = [rows[1] for rows in groups.values() if len(rows) == 4]
    if len(winners) != 8 or len(runners_up) != 8:
        raise ValueError('All eight groups must have four teams before knockout qualification')

    rng = secrets.SystemRandom()
    winner_order = winners[:]
    rng.shuffle(winner_order)

    def assign_runners(index, remaining):
        if index == len(winner_order):
            return []
        candidates = [
            runner for runner in remaining
            if runner['group_name'] != winner_order[index]['group_name']
        ]
        rng.shuffle(candidates)
        for candidate in candidates:
            remaining_runners = [
                runner for runner in remaining
                if runner['user_id'] != candidate['user_id']
            ]
            rest = assign_runners(index + 1, remaining_runners)
            if rest is not None:
                return [(winner_order[index], candidate), *rest]
        return None

    pairings = assign_runners(0, runners_up)
    if pairings is None:
        raise ValueError('Could not create valid Round of 16 matchups')
    return pairings


def _create_knockout_round(tournament, round_name, gameweek, entrants):
    scheduled_at = tournament.start_at + timedelta(days=gameweek - 1)
    for index in range(0, len(entrants), 2):
        player_one_id, player_two_id = entrants[index:index + 2]
        TournamentFixture(
            id=generate_id(),
            tournament_id=tournament.id,
            gameweek=gameweek,
            stage='knockout',
            round_name=round_name,
            bracket_slot=(index // 2) + 1,
            player_one_id=player_one_id,
            player_two_id=player_two_id,
            scheduled_at=scheduled_at,
            closes_at=scheduled_at + timedelta(days=1),
            status='scheduled',
        ).save()


def _advance_knockout(tournament):
    for index, (round_name, gameweek, match_count) in enumerate(KNOCKOUT_ROUNDS):
        round_fixtures = list(TournamentFixture.objects(
            tournament_id=tournament.id,
            stage='knockout',
            round_name=round_name,
        ).order_by('bracket_slot'))
        if not round_fixtures:
            if index == 0:
                pairings = _round_of_16_pairings(tournament)
                entrants = [
                    user_id
                    for winner, runner_up in pairings
                    for user_id in (winner['user_id'], runner_up['user_id'])
                ]
                _create_knockout_round(tournament, round_name, gameweek, entrants)
            else:
                previous_round_name = KNOCKOUT_ROUNDS[index - 1][0]
                previous_fixtures = list(TournamentFixture.objects(
                    tournament_id=tournament.id,
                    stage='knockout',
                    round_name=previous_round_name,
                ).order_by('bracket_slot'))
                if (
                    len(previous_fixtures) != KNOCKOUT_ROUNDS[index - 1][2]
                    or any(fixture.status != 'completed' for fixture in previous_fixtures)
                ):
                    return
                entrants = [fixture.winner_user_id for fixture in previous_fixtures]
                if any(not entrant for entrant in entrants):
                    raise ValueError(f'{previous_round_name} has a completed match without an advancing player')
                _create_knockout_round(tournament, round_name, gameweek, entrants)
            return
        if len(round_fixtures) != match_count:
            raise ValueError(f'{round_name} does not contain {match_count} fixtures')
        if any(fixture.status != 'completed' for fixture in round_fixtures):
            return


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


def refund_tournament_registrations(tournament, registrations):
    for registration in registrations:
        if not tournament.entry_fee:
            continue
        try:
            database = FootyCoinTransaction._get_db()
            transactions = FootyCoinTransaction._get_collection()
            users = User._get_collection()
            with database.client.start_session() as session:
                def refund_once(transaction_session):
                    already_refunded = transactions.find_one(
                        {
                            'user_id': registration.user_id,
                            'type': 'reward',
                            'reason': (
                                f'Refund: {tournament.name} ({tournament.id}) '
                                'did not have enough players'
                            ),
                        },
                        session=transaction_session,
                    )
                    if already_refunded:
                        return
                    updated = users.update_one(
                        {'_id': registration.user_id},
                        {'$inc': {'footy_coins': tournament.entry_fee}},
                        session=transaction_session,
                    )
                    if updated.matched_count != 1:
                        raise ValueError(
                            f'Could not refund tournament entry for {registration.user_id}'
                        )
                    transactions.insert_one({
                        '_id': generate_id(),
                        'user_id': registration.user_id,
                        'type': 'reward',
                        'amount': tournament.entry_fee,
                        'reason': (
                            f'Refund: {tournament.name} ({tournament.id}) '
                            'did not have enough players'
                        ),
                        'created_at': datetime.utcnow(),
                    }, session=transaction_session)

                session.with_transaction(refund_once)
        except Exception:
            current_app.logger.exception(
                'Could not refund underfilled tournament entry for user %s',
                registration.user_id,
            )
            raise


def start_tournament(tournament, now=None):
    now = now or datetime.utcnow()
    if tournament.tournament_type == 'group_knockout':
        _start_group_knockout_tournament(tournament, now)
        return

    registrations = list(
        TournamentRegistration.objects(tournament_id=tournament.id).order_by('joined_at')
    )
    if len(registrations) < 2:
        refund_tournament_registrations(tournament, registrations)
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
    tournament.season = (getattr(tournament, 'season', 1) or 1) + 1
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
        if fixture.stage == 'knockout' and first.points_earned == second.points_earned:
            if first.accuracy_rate > second.accuracy_rate:
                fixture.winner_user_id = fixture.player_one_id
                fixture.tiebreak_method = 'accuracy'
            elif second.accuracy_rate > first.accuracy_rate:
                fixture.winner_user_id = fixture.player_two_id
                fixture.tiebreak_method = 'accuracy'
            elif first.time_taken_seconds < second.time_taken_seconds:
                fixture.winner_user_id = fixture.player_one_id
                fixture.tiebreak_method = 'time'
            elif second.time_taken_seconds < first.time_taken_seconds:
                fixture.winner_user_id = fixture.player_two_id
                fixture.tiebreak_method = 'time'
            else:
                fixture.winner_user_id = secrets.choice(
                    [fixture.player_one_id, fixture.player_two_id]
                )
                fixture.tiebreak_method = 'draw_lots'
            fixture.result = 'win'
        elif first.points_earned > second.points_earned:
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
    elif fixture.stage == 'knockout':
        fixture.winner_user_id = secrets.choice(
            [fixture.player_one_id, fixture.player_two_id]
        )
        fixture.result = 'forfeit'
        fixture.tiebreak_method = 'double_forfeit_draw'
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
    if fixture.stage == 'knockout' and fixture.winner_user_id:
        winner = users[fixture.winner_user_id]
        if fixture.tiebreak_method == 'draw_lots':
            outcome = f'{winner.first_name} advances after a draw-lot tiebreak.'
        elif fixture.tiebreak_method == 'double_forfeit_draw':
            outcome = f'Neither player submitted; {winner.first_name} advances by draw lot.'
        elif fixture.tiebreak_method == 'accuracy':
            outcome = f'{winner.first_name} advances on higher accuracy.'
        elif fixture.tiebreak_method == 'time':
            outcome = f'{winner.first_name} advances on faster completion.'
        elif fixture.result == 'forfeit':
            outcome = f'{winner.first_name} advances by forfeit.'
        else:
            outcome = f'{winner.first_name} advances to the next round.'
        first_points = second_points = 0
    elif fixture.result == 'draw':
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
    stage_label = fixture.round_name or f'GW{fixture.gameweek}'
    if fixture.group_name:
        stage_label = f'Group {fixture.group_name} · {stage_label}'
    points_note = (
        ''
        if fixture.stage == 'knockout'
        else f' You earned {first_points} league points.'
    )
    first_message = (
        f'{stage_label} result: {first.first_name} {fixture.player_one_score} - '
        f'{fixture.player_two_score} {second.first_name}. {outcome}{points_note}'
    )
    second_points_note = (
        ''
        if fixture.stage == 'knockout'
        else f' You earned {second_points} league points.'
    )
    second_message = (
        f'{stage_label} result: {first.first_name} {fixture.player_one_score} - '
        f'{fixture.player_two_score} {second.first_name}. {outcome}{second_points_note}'
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
    if tournament.tournament_type == 'group_knockout':
        return [
            row
            for group_name in GROUP_NAMES
            for row in _group_fixture_stats(tournament, group_name)
        ]

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


def calculate_group_knockout_final_standings(tournament):
    group_rows = calculate_standings(tournament)
    rows_by_id = {row['user_id']: row for row in group_rows}
    placements = {}

    for round_name, first_place, last_place in (
        ('Final', 1, 2),
        ('Semi-finals', 3, 4),
        ('Quarter-finals', 5, 8),
        ('Round of 16', 9, 16),
    ):
        fixtures = list(TournamentFixture.objects(
            tournament_id=tournament.id,
            stage='knockout',
            round_name=round_name,
            status='completed',
        ))
        eliminated = []
        for fixture in fixtures:
            if not fixture.winner_user_id:
                continue
            if fixture.player_one_id != fixture.winner_user_id:
                eliminated.append(fixture.player_one_id)
            elif fixture.player_two_id != fixture.winner_user_id:
                eliminated.append(fixture.player_two_id)
            if round_name == 'Final':
                placements[fixture.winner_user_id] = first_place
                placements[(
                    fixture.player_two_id
                    if fixture.winner_user_id == fixture.player_one_id
                    else fixture.player_one_id
                )] = last_place

        if round_name != 'Final':
            eliminated.sort(key=lambda user_id: (
                -rows_by_id.get(user_id, {}).get('points', 0),
                -rows_by_id.get(user_id, {}).get('point_difference', 0),
                -rows_by_id.get(user_id, {}).get('points_for', 0),
                rows_by_id.get(user_id, {}).get('draw_lot', 0),
            ))
            for index, user_id in enumerate(eliminated):
                placements[user_id] = first_place + index

    non_qualifiers = [
        row for row in group_rows
        if row['rank'] > 2 and row['user_id'] not in placements
    ]
    non_qualifiers.sort(key=lambda row: (
        row['rank'],
        -row['points'],
        -row['point_difference'],
        -row['points_for'],
        row['draw_lot'],
    ))
    next_place = 17
    for row in non_qualifiers:
        placements[row['user_id']] = next_place
        next_place += 1

    final_rows = []
    for user_id, place in placements.items():
        if user_id in rows_by_id:
            final_rows.append({**rows_by_id[user_id], 'rank': place})
    final_rows.sort(key=lambda row: row['rank'])
    return final_rows


def _award_tournament_places(tournament, standings):
    """Persist placements and coin rewards once for the current tournament season."""
    if not standings:
        return

    TournamentAward.ensure_indexes()
    FootyCoinTransaction.ensure_indexes()
    database = TournamentAward._get_db()
    awards_collection = TournamentAward._get_collection()
    users_collection = User._get_collection()
    transactions_collection = FootyCoinTransaction._get_collection()
    place_rewards = getattr(tournament, 'place_rewards', {}) or {}
    season = getattr(tournament, 'season', 1) or 1

    if not any(place_rewards.get(str(row['rank']), 0) for row in standings):
        for standing in standings:
            TournamentAward.objects(
                tournament_id=tournament.id,
                season=season,
                user_id=standing['user_id'],
            ).update_one(
                upsert=True,
                set_on_insert__id=generate_id(),
                set_on_insert__place=standing['rank'],
                set_on_insert__coins_awarded=0,
                set_on_insert__awarded_at=datetime.utcnow(),
            )
        return

    def award_places(session):
        existing_user_ids = {
            award['user_id']
            for award in awards_collection.find(
                {'tournament_id': tournament.id, 'season': season},
                {'user_id': 1},
                session=session,
            )
        }
        now = datetime.utcnow()

        for standing in standings:
            user_id = standing['user_id']
            if user_id in existing_user_ids:
                continue

            amount = place_rewards.get(str(standing['rank']), 0)
            if amount:
                updated = users_collection.update_one(
                    {'_id': user_id},
                    {'$inc': {'footy_coins': amount}},
                    session=session,
                )
                if updated.matched_count != 1:
                    raise ValueError(
                        f"Could not award tournament prize: player {user_id} was not found"
                    )
                transactions_collection.insert_one({
                    '_id': generate_id(),
                    'user_id': user_id,
                    'type': 'reward',
                    'amount': amount,
                    'reason': (
                        f'Tournament prize: {tournament.name} '
                        f'(season {season}, place {standing["rank"]})'
                    ),
                    'created_at': now,
                }, session=session)

            awards_collection.insert_one({
                '_id': generate_id(),
                'tournament_id': tournament.id,
                'season': season,
                'user_id': user_id,
                'place': standing['rank'],
                'coins_awarded': amount,
                'awarded_at': now,
            }, session=session)

    with database.client.start_session() as session:
        session.with_transaction(award_places)


def finish_tournament(tournament):
    standings = (
        calculate_group_knockout_final_standings(tournament)
        if tournament.tournament_type == 'group_knockout'
        else calculate_standings(tournament)
    )
    if standings:
        if tournament.tournament_type == 'group_knockout':
            tournament.winner_user_ids = [
                row['user_id'] for row in standings if row['rank'] == 1
            ]
        else:
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
    _award_tournament_places(tournament, standings)
    _notify_tournament_completion(tournament, standings)


def _notify_tournament_completion(tournament, standings=None):
    if not tournament.completion_notification_sent:
        standings = standings or (
            calculate_group_knockout_final_standings(tournament)
            if tournament.tournament_type == 'group_knockout'
            else calculate_standings(tournament)
        )
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
    if (
        tournament.status == 'starting'
        and tournament.updated_at
        and tournament.updated_at <= now - timedelta(minutes=5)
    ):
        TournamentFixture.objects(tournament_id=tournament.id).delete()
        TournamentRegistration.objects(tournament_id=tournament.id).update(
            unset__group_name=1,
            set__draw_lot=0,
        )
        Tournament.objects(id=tournament.id, status='starting').update_one(
            set__status='registration',
            set__updated_at=now,
        )
        tournament.reload()

    if tournament.status == 'renewal' and tournament.start_at <= now:
        start_scheduled_restart(tournament, now)
        tournament.reload()

    if tournament.status in ('registration', 'cancelling') and tournament.start_at <= now:
        start_tournament(tournament, now)
        tournament.reload()

    if tournament.status == 'completed':
        final_standings = (
            calculate_group_knockout_final_standings(tournament)
            if tournament.tournament_type == 'group_knockout'
            else calculate_standings(tournament)
        )
        _award_tournament_places(tournament, final_standings)
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

    if tournament.tournament_type == 'group_knockout':
        group_fixtures = list(TournamentFixture.objects(
            tournament_id=tournament.id,
            stage='group',
        ))
        if len(group_fixtures) == 96 and all(
            fixture.status == 'completed' for fixture in group_fixtures
        ):
            _advance_knockout(tournament)

    end_at = tournament.start_at + timedelta(days=tournament.total_gameweeks)
    if now >= end_at and not TournamentFixture.objects(
        tournament_id=tournament.id,
        status='scheduled',
    ).first():
        finish_tournament(tournament)


def sync_all_tournaments():
    now = datetime.utcnow()
    for tournament in Tournament.objects(
        status__in=['registration', 'starting', 'cancelling', 'active', 'completed', 'renewal']
    ):
        try:
            sync_tournament(tournament, now)
        except Exception:
            from flask import current_app

            current_app.logger.exception('Could not advance tournament %s', tournament.id)
