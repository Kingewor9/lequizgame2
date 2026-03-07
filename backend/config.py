import os
from datetime import timedelta

class Config:
    """Base configuration"""
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'your-secret-key-change-in-production'
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY') or 'jwt-secret-key-change-in-production'
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(days=30)
    
    # Telegram
    TELEGRAM_BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '')
    TELEGRAM_BOT_USERNAME = os.environ.get('TELEGRAM_BOT_USERNAME', '')
    TELEGRAM_CHANNEL_URL = os.environ.get('TELEGRAM_CHANNEL_URL', '')
    MINIAPP_URL = os.environ.get('MINIAPP_URL', 'https://t.me/botname/appname')
    
    # MongoDB
    MONGODB_URI = os.environ.get('MONGODB_URI') or 'mongodb://localhost:27017/footy_iq'
    MONGODB_DB = os.environ.get('MONGODB_DB') or 'footy_iq'
    
    # Admin Configuration
    ADMIN_TELEGRAM_IDS = [
        int(x.strip()) for x in os.environ.get('ADMIN_TELEGRAM_IDS', '').split(',') if x.strip()
    ]


class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True
    TESTING = False


class TestingConfig(Config):
    """Testing configuration"""
    DEBUG = True
    TESTING = True
    MONGODB_URI = 'mongodb://localhost:27017/footy_iq_test'
    MONGODB_DB = 'footy_iq_test'


class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False
    TESTING = False


config = {
    'development': DevelopmentConfig,
    'testing': TestingConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}
