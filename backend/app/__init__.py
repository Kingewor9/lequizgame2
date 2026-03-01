import os
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
    CORS(app, supports_credentials=True)
    
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
        # Initialize default footy coin tasks if not exist
        initialize_default_tasks()
    
    return app


def initialize_default_tasks():
    """Initialize default footy coin tasks"""
    from app.models import FootyCoinTask
    from app.utils import generate_id
    
    # Check if tasks already exist
    if FootyCoinTask.objects.count() > 0:
        return
    
    tasks = [
        {
            'type': 'watch_ads',
            'title': 'Watch Ads',
            'description': 'Watch advertisement to earn Footy Coins',
            'reward_coins': 100,
        },
        {
            'type': 'free_claim',
            'title': 'Claim Free Coins',
            'description': 'Claim your free 250 Footy Coins bonus',
            'reward_coins': 250,
        },
        {
            'type': 'join_telegram',
            'title': 'Join Telegram Channel',
            'description': 'Join our official Telegram channel',
            'reward_coins': 150,
        },
    ]
    
    for task_data in tasks:
        task = FootyCoinTask(
            id=generate_id(),
            type=task_data['type'],
            title=task_data['title'],
            description=task_data['description'],
            reward_coins=task_data['reward_coins'],
            is_active=True
        )
        task.save()
