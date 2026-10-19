from mongoengine import (
    Document, StringField, IntField, BooleanField, ListField,
    EmbeddedDocument, EmbeddedDocumentField, DateTimeField, DynamicField,
    DictField,
)
from datetime import datetime
import uuid


class User(Document):
    """User model"""
    meta = {
        'collection': 'users',
        'indexes': ['telegram_id', 'username']
    }

    id = StringField(primary_key=True, default=lambda: str(uuid.uuid4()))
    telegram_id = IntField(unique=True, required=True)
    first_name = StringField(max_length=255, required=True)
    last_name = StringField(max_length=255)
    username = StringField(unique=True, sparse=True)
    photo_url = StringField(max_length=500)

    overall_score = IntField(default=0)
    global_rank = IntField(default=0)
    prev_global_rank = IntField(default=0)
    global_total_players = IntField(default=0)
    footy_coins = IntField(default=0)
    welcome_bonus_claimed = BooleanField(default=False)
    referral_code = StringField(unique=True, sparse=True)
    referred_by_id = StringField()
    referred_user_ids = ListField(StringField(), default=list)
    last_welcome_launch_id = StringField()

    created_at = DateTimeField(default=datetime.utcnow)
    updated_at = DateTimeField(default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'telegram_id': self.telegram_id,
            'first_name': self.first_name,
            'last_name': self.last_name,
            'username': self.username,
            'photo_url': self.photo_url,
            'overall_score': self.overall_score,
            'global_rank': self.global_rank,
            'prev_global_rank': getattr(self, 'prev_global_rank', 0),
            'global_total_players': self.global_total_players,
            'footy_coins': self.footy_coins,
            'created_at': self.created_at.isoformat() + 'Z',
            'updated_at': self.updated_at.isoformat() + 'Z',
        }


class AppLaunch(Document):
    """A verified app launch used to calculate daily active players."""
    meta = {
        'collection': 'app_launches',
        'indexes': [
            {'fields': ['launch_id'], 'unique': True},
            'user_id',
            'launched_at',
        ]
    }

    id = StringField(primary_key=True, default=lambda: str(uuid.uuid4()))
    launch_id = StringField(required=True)
    user_id = StringField(required=True)
    launched_at = DateTimeField(default=datetime.utcnow)


class Option(EmbeddedDocument):
    """Option embedded document"""
    id = StringField(required=True, default=lambda: str(uuid.uuid4()))
    option_text = StringField(required=True)
    order = IntField(default=0)

    def to_dict(self):
        return {
            'id': self.id,
            'option_text': self.option_text,
            'order': self.order,
        }


class Question(EmbeddedDocument):
    """Question embedded document"""
    id = StringField(required=True, default=lambda: str(uuid.uuid4()))
    question_text = StringField(required=True)
    question_type = StringField(default='multiple_choice')  # 'multiple_choice' or 'image_text'
    image_url = StringField()  # URL of image for image-based quiz
    correct_answer_text = StringField()  # Expected text answer (and aliases)
    options = ListField(EmbeddedDocumentField(Option))
    correct_option_id = StringField()
    order = IntField(default=0)

    def to_dict(self):
        return {
            'id': self.id,
            'question_text': self.question_text,
            'question_type': getattr(self, 'question_type', 'multiple_choice') or 'multiple_choice',
            'image_url': getattr(self, 'image_url', None),
            'correct_answer_text': getattr(self, 'correct_answer_text', None),
            'correct_option_id': self.correct_option_id,
            'order': self.order,
            'options': [o.to_dict() for o in self.options] if self.options else [],
        }


class Quiz(Document):
    """Quiz model"""
    meta = {
        'collection': 'quizzes',
        'indexes': ['is_active', 'expires_at']
    }

    id = StringField(primary_key=True, default=lambda: str(uuid.uuid4()))
    name = StringField(max_length=255, required=True)
    description = StringField()
    quiz_type = StringField(default='multiple_choice')  # 'multiple_choice' or 'image_text'
    total_questions = IntField(required=True)
    time_limit_seconds = IntField(required=True)
    points_per_question = IntField(default=10)
    total_points = IntField(required=True)
    cost_in_footy_coins = IntField(default=0)
    destination = StringField(default='game', choices=('game', 'tournament'))
    tournament_id = StringField()
    tournament_gameweek = IntField()
    is_active = BooleanField(default=True)
    questions = ListField(EmbeddedDocumentField(Question))

    created_at = DateTimeField(default=datetime.utcnow)
    expires_at = DateTimeField(required=True)
    scheduled_for = DateTimeField()
    notification_sent = BooleanField(default=False)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'quiz_type': getattr(self, 'quiz_type', 'multiple_choice') or 'multiple_choice',
            'total_questions': self.total_questions,
            'time_limit_seconds': self.time_limit_seconds,
            'points_per_question': self.points_per_question,
            'total_points': self.total_points,
            'cost_in_footy_coins': self.cost_in_footy_coins,
            'destination': getattr(self, 'destination', 'game') or 'game',
            'tournament_id': getattr(self, 'tournament_id', None),
            'tournament_gameweek': getattr(self, 'tournament_gameweek', None),
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() + 'Z',
            'expires_at': self.expires_at.isoformat() + 'Z',
            'scheduled_for': (self.scheduled_for.isoformat() + 'Z') if self.scheduled_for else None,
            'notification_sent': getattr(self, 'notification_sent', False),
            'questions': [q.to_dict() for q in self.questions] if self.questions else [],
        }


class QuizAnswer(EmbeddedDocument):
    """User's answer to a single question"""
    question_id = StringField(required=True)
    selected_option_id = StringField()
    answer_text = StringField()
    is_correct = BooleanField(required=True)

    def to_dict(self):
        return {
            'question_id': self.question_id,
            'selected_option_id': self.selected_option_id,
            'answer_text': getattr(self, 'answer_text', None),
            'is_correct': self.is_correct,
        }


class Tournament(Document):
    """A scheduled competition and its league-season state."""
    meta = {
        'collection': 'tournaments',
        'indexes': ['status', 'start_at', 'created_at'],
    }

    id = StringField(primary_key=True, default=lambda: str(uuid.uuid4()))
    name = StringField(max_length=255, required=True)
    description = StringField(default='')
    tournament_type = StringField(
        required=True,
        choices=('league', 'group_knockout'),
    )
    entry_fee = IntField(default=0, min_value=0)
    place_rewards = DictField(default=dict)
    max_players = IntField(default=20, min_value=2)
    registered_count = IntField(default=0, min_value=0)
    season = IntField(default=1, min_value=1)
    start_at = DateTimeField(required=True)
    status = StringField(
        default='registration',
        choices=('registration', 'active', 'completed', 'draft', 'cancelled', 'renewal'),
    )
    total_gameweeks = IntField(default=38)
    winner_user_ids = ListField(StringField(), default=list)
    completion_notification_sent = BooleanField(default=False)
    created_at = DateTimeField(default=datetime.utcnow)
    updated_at = DateTimeField(default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'tournament_type': self.tournament_type,
            'entry_fee': self.entry_fee,
            'place_rewards': getattr(self, 'place_rewards', {}) or {},
            'max_players': self.max_players,
            'registered_count': self.registered_count,
            'season': getattr(self, 'season', 1) or 1,
            'start_at': self.start_at.isoformat() + 'Z' if self.start_at else None,
            'status': self.status,
            'total_gameweeks': self.total_gameweeks,
            'winner_user_ids': self.winner_user_ids,
            'created_at': self.created_at.isoformat() + 'Z',
        }


class TournamentRegistration(Document):
    """A player's unique registration in a tournament."""
    meta = {
        'collection': 'tournament_registrations',
        'indexes': [
            {'fields': ['tournament_id', 'user_id'], 'unique': True},
            ['tournament_id', 'joined_at'],
            'user_id',
        ],
    }

    id = StringField(primary_key=True, default=lambda: str(uuid.uuid4()))
    tournament_id = StringField(required=True)
    user_id = StringField(required=True)
    joined_at = DateTimeField(default=datetime.utcnow)
    renewal_status = StringField(
        default='current',
        choices=('current', 'pending', 'accepted'),
    )


class TournamentAward(Document):
    """A player's final tournament placement and any Footy Coin prize."""
    meta = {
        'collection': 'tournament_awards',
        'indexes': [
            {'fields': ['tournament_id', 'season', 'user_id'], 'unique': True},
            ['user_id', 'place'],
        ],
    }

    id = StringField(primary_key=True, default=lambda: str(uuid.uuid4()))
    tournament_id = StringField(required=True)
    season = IntField(default=1, min_value=1)
    user_id = StringField(required=True)
    place = IntField(required=True, min_value=1)
    coins_awarded = IntField(default=0, min_value=0)
    awarded_at = DateTimeField(default=datetime.utcnow)


class TournamentFixture(Document):
    """One scheduled head-to-head pairing in a league gameweek."""
    meta = {
        'collection': 'tournament_fixtures',
        'indexes': [
            {'fields': ['tournament_id', 'gameweek', 'player_one_id', 'player_two_id'], 'unique': True},
            ['tournament_id', 'gameweek', 'scheduled_at'],
            'player_one_id',
            'player_two_id',
        ],
    }

    id = StringField(primary_key=True, default=lambda: str(uuid.uuid4()))
    tournament_id = StringField(required=True)
    gameweek = IntField(required=True)
    player_one_id = StringField(required=True)
    player_two_id = StringField()
    scheduled_at = DateTimeField(required=True)
    closes_at = DateTimeField(required=True)
    status = StringField(default='scheduled', choices=('scheduled', 'completed', 'bye'))
    player_one_score = IntField(default=0)
    player_two_score = IntField(default=0)
    player_one_submitted = BooleanField(default=False)
    player_two_submitted = BooleanField(default=False)
    winner_user_id = StringField()
    result = StringField(choices=('win', 'draw', 'forfeit', 'bye'))
    result_notification_sent = BooleanField(default=False)
    created_at = DateTimeField(default=datetime.utcnow)


class QuizResponse(Document):
    """User's quiz response"""
    meta = {
        'collection': 'quiz_responses',
        'indexes': ['user_id', 'quiz_id', 'completed_at']
    }

    id = StringField(primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = StringField(required=True)
    quiz_id = StringField(required=True)

    total_questions = IntField()
    correct_answers = IntField()
    incorrect_answers = IntField()
    points_earned = IntField()
    accuracy_rate = IntField()
    time_taken_seconds = IntField()

    answers = ListField(EmbeddedDocumentField(QuizAnswer))

    completed_at = DateTimeField(default=datetime.utcnow)
    created_at = DateTimeField(default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'quiz_id': self.quiz_id,
            'total_questions': self.total_questions,
            'correct_answers': self.correct_answers,
            'incorrect_answers': self.incorrect_answers,
            'points_earned': self.points_earned,
            'accuracy_rate': self.accuracy_rate,
            'time_taken_seconds': self.time_taken_seconds,
            'answers': [a.to_dict() for a in self.answers] if self.answers else [],
            'completed_at': self.completed_at.isoformat() + 'Z',
            'created_at': self.created_at.isoformat() + 'Z',
        }


class QuizAttempt(Document):
    """Tracks quiz starts and completions for participation analytics."""
    meta = {
        'collection': 'quiz_attempts',
        'indexes': [
            {'fields': ['user_id', 'quiz_id'], 'unique': True},
            'started_at',
            'completed_at',
        ]
    }

    id = StringField(primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = StringField(required=True)
    quiz_id = StringField(required=True)
    started_at = DateTimeField(default=datetime.utcnow)
    completed_at = DateTimeField(null=True, default=None)


class TournamentSubmission(Document):
    """A tournament-only quiz result, isolated from global and league scores."""
    meta = {
        'collection': 'tournament_submissions',
        'indexes': [
            {'fields': ['user_id', 'quiz_id'], 'unique': True},
            {'fields': ['tournament_id', 'gameweek', 'user_id'], 'unique': True},
            ['tournament_id', 'gameweek'],
        ],
    }

    id = StringField(primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = StringField(required=True)
    tournament_id = StringField(required=True)
    quiz_id = StringField(required=True)
    gameweek = IntField(required=True)
    total_questions = IntField(default=0)
    correct_answers = IntField(default=0)
    incorrect_answers = IntField(default=0)
    points_earned = IntField(default=0)
    accuracy_rate = IntField(default=0)
    time_taken_seconds = IntField(default=0)
    answers = ListField(EmbeddedDocumentField(QuizAnswer))
    opponent_notified = BooleanField(default=False)
    completed_at = DateTimeField(default=datetime.utcnow)
    created_at = DateTimeField(default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'tournament_id': self.tournament_id,
            'quiz_id': self.quiz_id,
            'gameweek': self.gameweek,
            'total_questions': self.total_questions,
            'correct_answers': self.correct_answers,
            'incorrect_answers': self.incorrect_answers,
            'points_earned': self.points_earned,
            'accuracy_rate': self.accuracy_rate,
            'time_taken_seconds': self.time_taken_seconds,
            'answers': [answer.to_dict() for answer in self.answers] if self.answers else [],
            'completed_at': self.completed_at.isoformat() + 'Z',
            'created_at': self.created_at.isoformat() + 'Z',
        }


class League(Document):
    """League model"""
    # ── Only ONE meta block ──────────────────────────────────────────────────
    meta = {
        'collection': 'leagues',
        'indexes': ['code', 'is_private', 'creator_id']
    }

    id = StringField(primary_key=True, default=lambda: str(uuid.uuid4()))
    name = StringField(max_length=255, required=True)
    description = StringField(default='')
    is_private = BooleanField(default=False)
    code = StringField(unique=True, sparse=True)
    creator_id = StringField(required=True)

    total_members = IntField(default=1)
    max_members = IntField(min_value=1, null=True, default=None)
    total_game_weeks = IntField(default=4)
    current_game_week = IntField(default=1)
    season = IntField(default=1)
    start_date = DateTimeField(default=datetime.utcnow)
    end_date = DateTimeField(default=datetime.utcnow)

    created_at = DateTimeField(default=datetime.utcnow)
    updated_at = DateTimeField(default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'is_private': self.is_private,
            'code': self.code,
            'creator_id': self.creator_id,
            'total_members': self.total_members,
            'max_members': self.max_members,
            'total_game_weeks': self.total_game_weeks,
            'current_game_week': self.current_game_week,
            'start_date': (self.start_date.isoformat() + 'Z') if self.start_date else None,
            'end_date': (self.end_date.isoformat() + 'Z') if self.end_date else None,
            'updated_at': self.updated_at.isoformat() + 'Z' if self.updated_at else None,
        }


class UserLeague(Document):
    """User membership in a league"""
    meta = {
        'collection': 'user_leagues',
        'indexes': [('user_id', 'league_id')]
    }

    id = StringField(primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = StringField(required=True)
    league_id = StringField(required=True)

    rank = IntField(default=0)
    prev_rank = IntField(default=0)  # tracks previous rank for arrow indicators
    points = IntField(default=0)
    is_owner = BooleanField(default=False)

    joined_at = DateTimeField(default=datetime.utcnow)

    def to_dict(self):
        league = League.objects(id=self.league_id).first()
        return {
            'id': self.id,
            'user_id': self.user_id,
            'league_id': self.league_id,
            'league': league.to_dict() if league else None,
            'rank': self.rank,
            'prev_rank': self.prev_rank,
            'points': self.points,
            'is_owner': self.is_owner,
            'joined_at': self.joined_at.isoformat() + 'Z',
        }


class LeagueTrophy(Document):
    """A user's win in a completed league season."""
    meta = {
        'collection': 'league_trophies',
        'indexes': [
            {'fields': ['user_id', 'league_id', 'season'], 'unique': True},
            {'fields': ['user_id', 'shown_at', 'awarded_at']}
        ]
    }

    id = StringField(primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = StringField(required=True)
    league_id = StringField(required=True)
    season = IntField(default=1)
    awarded_at = DateTimeField(default=datetime.utcnow)
    shown_at = DateTimeField(null=True, default=None)


class MilestoneAchievement(Document):
    """A user's one-time notification for reaching a career milestone."""
    meta = {
        'collection': 'milestone_achievements',
        'indexes': [
            {'fields': ['user_id', 'points'], 'unique': True},
            {'fields': ['user_id', 'shown_at', 'achieved_at']},
        ]
    }

    id = StringField(primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = StringField(required=True)
    title = StringField(required=True)
    points = IntField(required=True)
    achieved_at = DateTimeField(default=datetime.utcnow)
    shown_at = DateTimeField(null=True, default=None)


class FootyCoinTransaction(Document):
    """Footy coin transaction log"""
    meta = {
        'collection': 'footy_coin_transactions',
        'indexes': [
            'user_id',
            'created_at',
            {'fields': ['telegram_payment_charge_id'], 'unique': True, 'sparse': True},
        ]
    }

    id = StringField(primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = StringField(required=True)
    type = StringField()
    amount = IntField(required=True)
    reason = StringField()
    telegram_payment_charge_id = StringField()

    created_at = DateTimeField(default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'type': self.type,
            'amount': self.amount,
            'reason': self.reason,
            'created_at': self.created_at.isoformat() + 'Z',
        }


class StarsCoinPurchase(Document):
    """A Telegram Stars invoice and its payment state."""
    meta = {
        'collection': 'stars_coin_purchases',
        'indexes': [
            {'fields': ['invoice_payload'], 'unique': True},
            {'fields': ['telegram_payment_charge_id'], 'unique': True, 'sparse': True},
            ['user_id', 'created_at'],
        ]
    }

    id = StringField(primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = StringField(required=True)
    telegram_id = IntField(required=True)
    invoice_payload = StringField(required=True)
    amount = IntField(required=True)
    status = StringField(default='pending', choices=('pending', 'paid'))
    telegram_payment_charge_id = StringField()
    created_at = DateTimeField(default=datetime.utcnow)
    paid_at = DateTimeField()


class FootyCoinTask(Document):
    """Footy coin earning tasks"""
    meta = {
        'collection': 'footy_coin_tasks'
    }

    id = StringField(primary_key=True, default=lambda: str(uuid.uuid4()))
    type = StringField()
    title = StringField(max_length=255, required=True)
    description = StringField()
    reward_coins = IntField(default=100)
    telegram_channel = StringField()
    is_active = BooleanField(default=True)

    created_at = DateTimeField(default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'type': self.type,
            'title': self.title,
            'description': self.description,
            'reward_coins': self.reward_coins,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() + 'Z',
        }


class UserFootyCoinTask(Document):
    """User's completion status of footy coin tasks"""
    meta = {
        'collection': 'user_footy_coin_tasks',
        'indexes': [('user_id', 'task_id')]
    }

    id = StringField(primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = StringField(required=True)
    task_id = StringField(required=True)

    is_completed = BooleanField(default=False)
    completed_at = DateTimeField()
    created_at = DateTimeField(default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'task_id': self.task_id,
            'is_completed': self.is_completed,
            'completed_at': (self.completed_at.isoformat() + 'Z') if self.completed_at else None,
            'created_at': self.created_at.isoformat() + 'Z',
        }