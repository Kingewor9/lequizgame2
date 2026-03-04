from mongoengine import (
    Document, StringField, IntField, BooleanField, ListField,
    EmbeddedDocument, EmbeddedDocumentField, DateTimeField, DynamicField
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
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
        }


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
    options = ListField(EmbeddedDocumentField(Option))
    correct_option_id = StringField()
    order = IntField(default=0)

    def to_dict(self):
        return {
            'id': self.id,
            'question_text': self.question_text,
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
    total_questions = IntField(required=True)
    time_limit_seconds = IntField(required=True)
    points_per_question = IntField(default=10)
    total_points = IntField(required=True)
    cost_in_footy_coins = IntField(default=0)
    is_active = BooleanField(default=True)
    questions = ListField(EmbeddedDocumentField(Question))

    created_at = DateTimeField(default=datetime.utcnow)
    expires_at = DateTimeField(required=True)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'total_questions': self.total_questions,
            'time_limit_seconds': self.time_limit_seconds,
            'points_per_question': self.points_per_question,
            'total_points': self.total_points,
            'cost_in_footy_coins': self.cost_in_footy_coins,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat(),
            'expires_at': self.expires_at.isoformat(),
            'questions': [q.to_dict() for q in self.questions] if self.questions else [],
        }


class QuizAnswer(EmbeddedDocument):
    """User's answer to a single question"""
    question_id = StringField(required=True)
    selected_option_id = StringField(required=True)
    is_correct = BooleanField(required=True)

    def to_dict(self):
        return {
            'question_id': self.question_id,
            'selected_option_id': self.selected_option_id,
            'is_correct': self.is_correct,
        }


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
            'completed_at': self.completed_at.isoformat(),
            'created_at': self.created_at.isoformat(),
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
    total_game_weeks = IntField(default=4)
    current_game_week = IntField(default=1)
    start_date = DateTimeField(default=datetime.utcnow)
    end_date = DateTimeField(default=datetime.utcnow)

    created_at = DateTimeField(default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'is_private': self.is_private,
            'code': self.code,
            'creator_id': self.creator_id,
            'total_members': self.total_members,
            'total_game_weeks': self.total_game_weeks,
            'current_game_week': self.current_game_week,
            'start_date': self.start_date.isoformat() if self.start_date else None,
            'end_date': self.end_date.isoformat() if self.end_date else None,
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
            'joined_at': self.joined_at.isoformat(),
        }


class FootyCoinTransaction(Document):
    """Footy coin transaction log"""
    meta = {
        'collection': 'footy_coin_transactions',
        'indexes': ['user_id', 'created_at']
    }

    id = StringField(primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = StringField(required=True)
    type = StringField()
    amount = IntField(required=True)
    reason = StringField()

    created_at = DateTimeField(default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'type': self.type,
            'amount': self.amount,
            'reason': self.reason,
            'created_at': self.created_at.isoformat(),
        }


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
            'created_at': self.created_at.isoformat(),
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
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'created_at': self.created_at.isoformat(),
        }