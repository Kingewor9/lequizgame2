import os
from dotenv import load_dotenv

# Load root and local .env unconditionally
load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))

from flask import Flask, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from config import config
from app.extensions import init_extensions
from app.routes import register_blueprints


def create_app(config_name=None):
    """Application factory"""
    if config_name is None:
        config_name = os.environ.get('FLASK_ENV', 'development')
    
    app = Flask(__name__)
    
    # Load config
    app.config.from_object(config[config_name])
    
    # Initialize extensions (including MongoDB)
    init_extensions(app)
    jwt = JWTManager(app)
    CORS(app, origins=[os.environ.get('FRONTEND_URL', 'http://localhost:5173')], supports_credentials=True)
    
    # Register blueprints
    register_blueprints(app)
    
    # Error handlers
    @app.errorhandler(404)
    def not_found(error):
        return jsonify({'success': False, 'error': 'Not found'}), 404
    
    @app.errorhandler(500)
    def internal_error(error):
        return jsonify({'success': False, 'error': 'Internal server error'}), 500
    
    @app.errorhandler(401)
    def unauthorized(error):
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    
    # Health check
    @app.route('/api/health', methods=['GET'])
    def health_check():
        return jsonify({'status': 'ok', 'message': 'Footy IQ API is running'}), 200
    
    # Database initialization
    with app.app_context():
        initialize_default_tasks()
    
    return app


def initialize_default_tasks():
    """Initialize default footy coin tasks if they don't exist yet."""
    from app.models import FootyCoinTask
    from app.utils import generate_id

    defaults = [
        {
            'type': 'watch_ads',
            'title': 'Earn 50 Footy Coins',
            'description': 'Watch a short ad without skipping to claim your reward. Repeatable!',
            'reward_coins': 50,
        },
        {
            'type': 'free_claim',
            'title': 'Welcome Bonus',
            'description': 'Claim your one-time welcome gift of 250 Footy Coins.',
            'reward_coins': 250,
        },
        {
            'type': 'join_telegram',
            'title': 'Join Our Telegram Channel',
            'description': 'Join @footyriddles on Telegram and earn 150 Footy Coins.',
            'reward_coins': 150,
        },
    ]

    for task_data in defaults:
        exists = FootyCoinTask.objects(type=task_data['type']).first()
        if not exists:
            FootyCoinTask(
                id=generate_id(),
                is_active=True,
                **task_data
            ).save()