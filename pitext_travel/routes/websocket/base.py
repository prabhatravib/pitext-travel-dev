# pitext_travel/routes/websocket/base.py
"""Base WebSocket handler with common functionality."""

import logging
from flask import request, session
from flask_socketio import emit

logger = logging.getLogger(__name__)

# Define namespace constant
NAMESPACE = "/travel/ws"


class BaseWebSocketHandler:
    """Base class for WebSocket handlers with common functionality."""
    
    def __init__(self, socketio, namespace=NAMESPACE):
        self.socketio = socketio
        self.namespace = namespace
        
    def emit_to_client(self, event, data, room=None):
        """Emit event to a specific client or room."""
        try:
            if room:
                self.socketio.emit(event, data, room=room, namespace=self.namespace)
            else:
                emit(event, data, namespace=self.namespace)
        except Exception as e:
            logger.error(f"Failed to emit {event}: {e}")
            
    def get_client_info(self):
        """Get information about the connected client."""
        return {
            "sid": request.sid,
            "ip": request.remote_addr,
            "origin": request.headers.get('Origin', 'unknown'),
            "flask_session_id": session.get('_id', f'anon_{request.sid}')
        }
        
    def log_event(self, event_name, data=None):
        """Log WebSocket events consistently."""
        client_info = self.get_client_info()
        if data:
            logger.info(f"[WS] {event_name} - Client: {client_info['sid']}, Data: {data}")
        else:
            logger.info(f"[WS] {event_name} - Client: {client_info['sid']}")
            
    def handle_error(self, error, event_name=""):
        """Handle and log errors consistently."""
        client_info = self.get_client_info()
        logger.error(f"[WS] Error in {event_name} - Client: {client_info['sid']}, Error: {error}")
        self.emit_to_client('error', {'message': str(error), 'event': event_name})