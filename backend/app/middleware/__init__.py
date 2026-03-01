from functools import wraps
from flask import request, jsonify
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity

def token_required(f):
    """
    Decorator to require valid JWT token
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        try:
            verify_jwt_in_request()
            current_user_id = get_jwt_identity()
            return f(current_user_id=current_user_id, *args, **kwargs)
        except Exception as e:
            return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    return decorated

def admin_required(f):
    """
    Decorator to require admin credentials
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        
        if not auth_header:
            return jsonify({'success': False, 'error': 'Missing authorization header'}), 401
        
        try:
            auth_type, credentials = auth_header.split()
            if auth_type.lower() != 'bearer':
                return jsonify({'success': False, 'error': 'Invalid authorization type'}), 401
            
            # For admin, you could verify a special token or use basic auth
            # This is a simplified version
            verify_jwt_in_request()
            # Add additional admin check here
            return f(*args, **kwargs)
        except Exception as e:
            return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    
    return decorated
