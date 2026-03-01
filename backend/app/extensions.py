from flask_jwt_extended import JWTManager
from flask_cors import CORS
from mongoengine import connect, disconnect

jwt = JWTManager()


def init_extensions(app):
    """Initialize Flask extensions"""
    jwt.init_app(app)
    CORS(app, origins=['*'], supports_credentials=True)
    
    # Connect to MongoDB
    disconnect()  # Disconnect any existing connections
    connect(
        db=app.config['MONGODB_DB'],
        host=app.config['MONGODB_URI']
    )
