#!/usr/bin/env python
import os
from app import create_app, db
from app.models import User, Quiz, Question, Option, QuizResponse, League, UserLeague, FootyCoinTask, UserFootyCoinTask, FootyCoinTransaction

app = create_app(os.environ.get('FLASK_ENV', 'development'))


@app.shell_context_processor
def make_shell_context():
    """Create shell context for flask shell"""
    return {
        'db': db,
        'User': User,
        'Quiz': Quiz,
        'Question': Question,
        'Option': Option,
        'QuizResponse': QuizResponse,
        'League': League,
        'UserLeague': UserLeague,
        'FootyCoinTask': FootyCoinTask,
        'UserFootyCoinTask': UserFootyCoinTask,
        'FootyCoinTransaction': FootyCoinTransaction,
    }


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    app.run(host='0.0.0.0', port=port, debug=app.config['DEBUG'])
