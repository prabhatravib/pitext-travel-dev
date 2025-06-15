# pitext_travel/routes/websocket.py
"""
WebSocket route handlers for Realtime API integration.
"""

import base64
import logging
import time
from typing import Optional, Callable

from flask import request, session
from flask_socketio import emit, disconnect

logger = logging.getLogger(__name__)

# Define namespace constant
NAMESPACE = "/travel/ws"


# --------------------------------------------------------------------------- #
# Helper: bridge Realtime-API callbacks → Socket.IO events                    #
# --------------------------------------------------------------------------- #
def _wire_realtime_callbacks(
    socketio, realtime_session, sid: str, namespace: str = "/travel/ws"
) -> None:
    """
    Attach handlers so that audio and transcript updates coming from
    `RealtimeClient` get streamed back to the browser in real-time.
    """
    client = realtime_session.client
    if client is None:  # should not happen after activation
        return

    # -- audio ----------------------------------------------------------------

def register_websocket_handlers(socketio):
    """Register WebSocket event handlers with SocketIO.
    
    Args:
        socketio: Flask-SocketIO instance
    """
    
    logger.info("Registering WebSocket handlers...")
    
    @socketio.on('connect', namespace='/travel/ws')
    def handle_connect(auth):
        """Handle WebSocket connection from browser."""
        user_ip = request.remote_addr
        origin = request.headers.get('Origin', 'unknown')
        
        logger.info(f"WebSocket connected from {user_ip}, origin: {origin}")
        
        try:
            # Import here to avoid circular imports
            from pitext_travel.api.realtime.session_manager import get_session_manager
            
            # Create session ID from Flask session
            flask_sid = session.get('_id', 'anonymous')
            
            # Create or get existing Realtime session
            manager = get_session_manager()
            realtime_session = manager.get_session_by_flask_id(flask_sid)
            
            if not realtime_session:
                realtime_session = manager.create_session(user_ip, flask_sid)
                
                if not realtime_session:
                    logger.error("Failed to create realtime session - rate limited")
                    emit('error', {'message': 'Rate limit exceeded or server at capacity'})
                    disconnect()
                    return
            
            # Store session ID in SocketIO session
            session['realtime_session_id'] = realtime_session.session_id
            
            logger.info(f"Session created: {realtime_session.session_id}")
            
            emit('connected', {
                'session_id': realtime_session.session_id,
                'status': 'connected'
            })
            
        except Exception as e:
            logger.error(f"Error in connect handler: {e}")
            emit('error', {'message': 'Connection failed'})
            disconnect()
    
    @socketio.on('disconnect', namespace='/travel/ws')
    def handle_disconnect():
        """Handle WebSocket disconnection."""
        session_id = session.get('realtime_session_id')
        
        if session_id:
            try:
                from pitext_travel.api.realtime.session_manager import get_session_manager
                manager = get_session_manager()
                manager.deactivate_session(session_id, 'client_disconnect')
                logger.info(f"WebSocket disconnected, session {session_id} deactivated")
            except Exception as e:
                logger.error(f"Error in disconnect handler: {e}")
    
    @socketio.on('ping', namespace='/travel/ws')
    def handle_ping():
        """Handle ping for connection testing."""
        emit('pong', {'timestamp': time.time()})
    
    # Add more handlers as needed...
    
    logger.info("WebSocket handlers registered successfully")