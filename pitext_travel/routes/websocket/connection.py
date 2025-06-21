# pitext_travel/routes/websocket/connection.py
"""WebSocket connection and disconnection handlers."""

import time
import logging
from flask import session
from flask_socketio import disconnect

from .base import BaseWebSocketHandler, NAMESPACE

logger = logging.getLogger(__name__)


class ConnectionHandler(BaseWebSocketHandler):
    """Handles WebSocket connection lifecycle events."""
    
    def register_handlers(self):
        """Register connection-related event handlers."""
        
        @self.socketio.on('connect', namespace=NAMESPACE)
        def handle_connect(auth):
            """Handle WebSocket connection from browser."""
            client_info = self.get_client_info()
            self.log_event('connect', {'auth': auth})
            
            try:
                # Ensure Flask session has an ID
                if '_id' not in session:
                    session['_id'] = client_info['flask_session_id']
                    session.modified = True
                
                # For now, just acknowledge the connection without complex session management
                logger.info(f"✅ WebSocket connected: {client_info['sid']}")
                
                self.emit_to_client('connected', {
                    'session_id': client_info['sid'],
                    'status': 'connected',
                    'flask_session_id': session['_id']
                })
                
            except Exception as e:
                logger.error(f"Connection error: {e}")
                self.handle_error(e, 'connect')
                disconnect()
        
        @self.socketio.on('disconnect', namespace=NAMESPACE)
        def handle_disconnect():
            """Handle WebSocket disconnection."""
            session_id = session.get('realtime_session_id')
            
            if session_id:
                try:
                    # For now, just log the disconnect without complex session management
                    logger.info(f"🔌 WebSocket disconnected, session {session_id}")
                except Exception as e:
                    self.handle_error(e, 'disconnect')
            else:
                self.log_event('disconnect', {'no_session': True})
        
        @self.socketio.on('ping', namespace=NAMESPACE)
        def handle_ping():
            """Handle ping for connection testing."""
            self.emit_to_client('pong', {'timestamp': time.time()})
        
        @self.socketio.on('test', namespace=NAMESPACE)
        def handle_test(data):
            """Handle test event for debugging."""
            logger.info(f"Test event received: {data}")
            self.emit_to_client('test_response', {
                'message': 'Test successful',
                'received_data': data,
                'timestamp': time.time()
            })
        
        # Register default namespace handlers for compatibility
        @self.socketio.on("connect")
        def handle_default_connect():
            """Default namespace connection handler."""
            logger.info("Client connected to default namespace")
            
        @self.socketio.on("disconnect")
        def handle_default_disconnect():
            """Default namespace disconnection handler."""
            logger.info("Client disconnected from default namespace")