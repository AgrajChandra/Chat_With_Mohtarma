#!/usr/bin/env python3
"""
Basic Chat Application Server
Flask + Socket.IO WebSocket server for real-time messaging
"""

import os
import logging
from datetime import datetime
from flask import Flask, render_template_string, request
from flask_socketio import SocketIO, emit, disconnect
from flask_cors import CORS

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'your-secret-key-here')

# Enable CORS for cross-origin requests
CORS(app, origins="*")

# Initialize Socket.IO with CORS support
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    logger=True,
    engineio_logger=True,
    async_mode='threading'
)

# Store connected clients
connected_clients = {}  # {sid: {'id': sid, 'username': ..., ...}}
usernames = {}  # {username: sid}

def sanitize_message(message):
    """Sanitize message content to prevent XSS and other issues"""
    if not isinstance(message, str):
        return ""
    
    # Basic sanitization
    sanitized = message.strip()
    sanitized = sanitized.replace('<', '&lt;').replace('>', '&gt;')
    
    # Limit message length
    if len(sanitized) > 500:
        sanitized = sanitized[:500] + "..."
    
    return sanitized

def validate_message_data(data):
    """Validate incoming message data"""
    if not isinstance(data, dict):
        return False, "Invalid message format"
    
    if 'text' not in data or not data['text']:
        return False, "Message text is required"
    
    if len(data['text']) > 500:
        return False, "Message too long"
    
    return True, None

def broadcast_user_list():
    """Emit the list of online users to all clients except those who haven't set a username yet."""
    users = list(usernames.keys())
    socketio.emit('user_list', {'users': users})

@app.route('/')
def index():
    """Serve a simple test page"""
    html_template = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Chat Server Status</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            .status { color: green; font-weight: bold; }
            .info { background: #f0f0f0; padding: 20px; border-radius: 5px; }
        </style>
    </head>
    <body>
        <h1>Chat Server Status</h1>
        <p class="status">✅ Server is running!</p>
        <div class="info">
            <h3>Connection Information:</h3>
            <p><strong>WebSocket URL:</strong> ws://localhost:8080</p>
            <p><strong>Connected Clients:</strong> {{ client_count }}</p>
        </div>
        <p>Open your chat client to connect to this server.</p>
    </body>
    </html>
    """
    return render_template_string(
        html_template,
        client_count=len(connected_clients)
    )

@socketio.on('connect')
def handle_connect(auth):
    client_id = request.sid
    connected_clients[client_id] = {
        'id': client_id,
        'connected_at': datetime.now(),
        'ip': request.environ.get('REMOTE_ADDR', 'unknown'),
        'username': None
    }
    logger.info(f"Client connected: {client_id} from {connected_clients[client_id]['ip']}")
    logger.info(f"Total connected clients: {len(connected_clients)}")
    # Wait for username to be set
    broadcast_user_list()

@socketio.on('set_username')
def handle_set_username(data):
    client_id = request.sid
    username = data.get('username')
    if not username or not isinstance(username, str):
        emit('error', {'message': 'Invalid username'})
        disconnect()
        return
    # Prevent duplicate usernames
    if username in usernames:
        emit('error', {'message': 'Username already taken'})
        disconnect()
        return
    connected_clients[client_id]['username'] = username
    usernames[username] = client_id
    logger.info(f"Username set: {username} for client {client_id}")
    broadcast_user_list()
    # No broadcast, no message history

@socketio.on('disconnect')
def handle_disconnect():
    client_id = request.sid
    username = None
    if client_id in connected_clients:
        username = connected_clients[client_id]['username']
        del connected_clients[client_id]
    if username and username in usernames:
        del usernames[username]
    logger.info(f"Client disconnected: {client_id}")
    logger.info(f"Total connected clients: {len(connected_clients)}")
    broadcast_user_list()
    # No broadcast

@socketio.on('message')
def handle_message(data):
    client_id = request.sid
    from_username = connected_clients.get(client_id, {}).get('username')
    to_username = data.get('to')
    text = data.get('text')
    if not from_username or not to_username or not text:
        emit('error', {'message': 'Invalid message. "to" and "text" required.'})
        return
    to_sid = usernames.get(to_username)
    if not to_sid:
        emit('error', {'message': 'Recipient not found'})
        return
    sanitized_text = sanitize_message(text)
    message = {
        'text': sanitized_text,
        'timestamp': datetime.now().isoformat(),
        'from': from_username,
        'to': to_username
    }
    # Send to recipient only (as 'private_message')
    socketio.emit('private_message', message, to=to_sid)
    # Send to sender only (as 'private_message')
    socketio.emit('private_message', message, to=client_id)

@socketio.on('ping')
def handle_ping():
    """Handle ping requests for connection testing"""
    emit('pong', {'timestamp': datetime.now().isoformat()})

@socketio.on_error_default
def default_error_handler(e):
    """Handle Socket.IO errors"""
    logger.error(f"Socket.IO error: {str(e)}")
    emit('error', {'message': 'An error occurred'})

@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors"""
    return "Chat server is running. Connect via WebSocket on port 8080.", 404

@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors"""
    logger.error(f"Internal server error: {str(error)}")
    return "Internal server error", 500

if __name__ == '__main__':
    try:
        logger.info("Starting chat server...")
        logger.info("Server will be available at: http://localhost:8080")
        logger.info("WebSocket endpoint: ws://localhost:8080")
        
        # Run the server
        socketio.run(
            app,
            host='0.0.0.0',
            port=8080,
            debug=False,  # Set to True for development
            allow_unsafe_werkzeug=True
        )
        
    except KeyboardInterrupt:
        logger.info("Server stopped by user")
    except Exception as e:
        logger.error(f"Failed to start server: {str(e)}")
