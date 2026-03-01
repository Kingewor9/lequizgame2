from app.routes.auth import auth_bp
from app.routes.quiz import quiz_bp
from app.routes.league import league_bp
from app.routes.coins import coins_bp
from app.routes.user import user_bp
from app.routes.admin import admin_bp


def register_blueprints(app):
    """Register all blueprints"""
    app.register_blueprint(auth_bp)
    app.register_blueprint(quiz_bp)
    app.register_blueprint(league_bp)
    app.register_blueprint(coins_bp)
    app.register_blueprint(user_bp)
    app.register_blueprint(admin_bp)
