# pitext_travel/routes/websocket.py
"""WebSocket route handlers for Realtime API integration."""

import logging
import json
from flask import session, request
from flask_socketio import emit, disconnect, join_room, leave_room
from typing import Optional
import time

# Configure logging
logger = logging.getLogger(__name__)

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
    @socketio.on('start_session', namespace='/travel/ws')
    def handle_start_session(data):
        """Start a Realtime API session."""
        session_id = session.get('realtime_session_id')
        
        if not session_id:
            emit('error', {'message': 'No session available'})
            return
        
        try:
            from pitext_travel.api.realtime.session_manager import get_session_manager
            manager = get_session_manager()
            realtime_session = manager.get_session(session_id)
            
            if realtime_session:
                # Activate the session (connect to OpenAI)
                if manager.activate_session(session_id):
                    emit('session_started', {
                        'session_id': session_id,
                        'status': 'active'
                    })
                else:
                    emit('error', {'message': 'Failed to activate session'})
            else:
                emit('error', {'message': 'Session not found'})
                
        except Exception as e:
            logger.error(f"Error starting session: {e}")
            emit('error', {'message': 'Failed to start session'})

    @socketio.on('audio_data', namespace='/travel/ws')
    def handle_audio_data(data):
        """Handle audio data from client."""
        session_id = session.get('realtime_session_id')
        
        if not session_id:
            emit('error', {'message': 'No session available'})
            return
        
        try:
            from pitext_travel.api.realtime.session_manager import get_session_manager
            manager = get_session_manager()
            realtime_session = manager.get_session(session_id)
            
            if realtime_session and realtime_session.client:
                audio_data = data.get('audio')
                if audio_data:
                    import base64
                    audio_bytes = base64.b64decode(audio_data)
                    realtime_session.client.send_audio(audio_bytes)
                    
                    # Update stats
                    manager.update_session_stats(session_id, audio_sent=len(audio_bytes))
                    
        except Exception as e:
            logger.error(f"Error handling audio data: {e}")
            emit('error', {'message': 'Failed to process audio'})

    @socketio.on('commit_audio', namespace='/travel/ws')
    def handle_commit_audio():
        """Commit audio buffer for processing."""
        session_id = session.get('realtime_session_id')
        
        if session_id:
            try:
                from pitext_travel.api.realtime.session_manager import get_session_manager
                manager = get_session_manager()
                realtime_session = manager.get_session(session_id)
                
                if realtime_session and realtime_session.client:
                    realtime_session.client.commit_audio()
                    
            except Exception as e:
                logger.error(f"Error committing audio: {e}")

    @socketio.on('interrupt', namespace='/travel/ws')
    def handle_interrupt():
        """Handle user interrupt (barge-in)."""
        session_id = session.get('realtime_session_id')
        
        if session_id:
            try:
                from pitext_travel.api.realtime.session_manager import get_session_manager
                manager = get_session_manager()
                realtime_session = manager.get_session(session_id)
                
                if realtime_session and realtime_session.client:
                    realtime_session.client.interrupt()
                    emit('interrupted', {'status': 'interrupted'})
                    
            except Exception as e:
                logger.error(f"Error handling interrupt: {e}")
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