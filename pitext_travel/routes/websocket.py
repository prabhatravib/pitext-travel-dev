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
    def _on_audio_chunk(chunk: bytes, item_id: Optional[str] = None) -> None:
        try:
            socketio.emit(
                "audio_chunk",
                {
                    "audio": base64.b64encode(chunk).decode(),
                    "item_id": item_id,
                },
                room=sid,
                namespace=namespace,
                binary=False,
            )
        except Exception as exc:
            logger.exception("Failed emitting audio_chunk: %s", exc)

    # -- transcript -----------------------------------------------------------
    def _on_transcript(text: str, item_id: Optional[str], is_final: bool) -> None:
        try:
            socketio.emit(
                "transcript",
                {
                    "text": text,
                    "item_id": item_id,
                    "is_final": is_final,
                    "role": "assistant"
                },
                room=sid,
                namespace=namespace,
            )
        except Exception as exc:
            logger.exception("Failed emitting transcript: %s", exc)

    # -- function calls -------------------------------------------------------
    def _on_function_call(call_id: str, name: str, args: dict) -> None:
        try:
            logger.info(f"Received function call: {name} with args: {args}")
            
            if hasattr(realtime_session, 'function_handler'):
                result = realtime_session.function_handler.handle_function_call(
                    call_id, name, args
                )
                
                realtime_session.client.send_function_result(call_id, result)
                
                if name == "plan_trip" and result.get("success"):
                    logger.info("Emitting render_itinerary event to frontend")
                    socketio.emit(
                        "render_itinerary",
                        {
                            "itinerary": result.get("itinerary"),
                            "city": result.get("city"),
                            "days": result.get("days")
                        },
                        room=sid,
                        namespace=namespace
                    )
                elif name == "explain_day" and result.get("needs_session_data"):
                    flask_session = session
                    if 'current_itinerary' in flask_session:
                        voice_response = realtime_session.function_handler.format_explain_day_response(
                            flask_session['current_itinerary'],
                            flask_session.get('current_city', 'your destination'),
                            result.get('day_number', 0)
                        )
                        
                        result['voice_response'] = voice_response
                        realtime_session.client.send_function_result(call_id, result)
            else:
                logger.error(f"No function handler available for session {realtime_session.session_id}")
                
        except Exception as exc:
            logger.exception("Failed handling function call: %s", exc)
            error_result = {
                "success": False,
                "error": str(exc),
                "call_id": call_id,
                "function": name
            }
            realtime_session.client.send_function_result(call_id, error_result)

    # -- error handling -------------------------------------------------------
    def _on_error(error: str) -> None:
        try:
            logger.error(f"Realtime API error: {error}")
            socketio.emit(
                "error",
                {"message": error},
                room=sid,
                namespace=namespace,
            )
        except Exception as exc:
            logger.exception("Failed emitting error: %s", exc)

    # -- session updates ------------------------------------------------------
    def _on_session_update(session_data: dict) -> None:
        try:
            socketio.emit(
                "session_update",
                session_data,
                room=sid,
                namespace=namespace,
            )
        except Exception as exc:
            logger.exception("Failed emitting session_update: %s", exc)

    # Wire up all callbacks
    client.on_audio_chunk = _on_audio_chunk
    client.on_transcript = _on_transcript
    client.on_function_call = _on_function_call
    client.on_error = _on_error
    client.on_session_update = _on_session_update

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
    
# -------------------------- START REALTIME SESSION ----------------------- #
    @socketio.on("start_session", namespace=NAMESPACE)
    def handle_start_session(data):
        """Start OpenAI Realtime API session."""
        session_id = session.get("realtime_session_id")
        if not session_id:
            emit("error", {"message": "No session available"})
            logger.error("No realtime_session_id in session")
            return

        try:
            from pitext_travel.api.realtime.session_manager import get_session_manager
            from pitext_travel.api.realtime.function_handler import create_function_handler

            manager = get_session_manager()
            realtime_session = manager.get_session(session_id)
            if realtime_session is None:
                logger.error(f"Session {session_id} not found in manager")
                emit("error", {"message": "Session not found"})
                return

            # Activate (ie, open WS to the OpenAI Realtime API)
            logger.info(f"Activating session {session_id}...")
            if not manager.activate_session(session_id):
                logger.error(f"Failed to activate session {session_id}")
                emit("error", {"message": "Failed to activate session"})
                return

            logger.info(f"Session {session_id} activated successfully")

            # Create and attach function handler
            flask_session_id = session.get("_id", "anonymous")
            function_handler = create_function_handler(flask_session_id)
            realtime_session.function_handler = function_handler
            
            # Get function definitions
            functions = function_handler.get_function_definitions()
            
            # Configure the Realtime session with travel functions
            logger.info(f"Registering {len(functions)} functions with Realtime API")
            realtime_session.client.update_session(
                instructions=realtime_session.client.config["instructions"],
                functions=functions,
                temperature=realtime_session.client.config["temperature"]
            )

            # Bridge callbacks → browser
            _wire_realtime_callbacks(socketio, realtime_session, request.sid, NAMESPACE)

            emit(
                "session_started",
                {
                    "session_id": session_id,
                    "status": "active",
                    "functions_registered": len(functions)
                },
            )
            logger.info("Realtime session %s started with %d functions", session_id, len(functions))

        except Exception as exc:
            logger.exception("Error starting session: %s", exc)
            emit("error", {"message": f"Failed to start session: {str(exc)}"})

    # ----------------------------- AUDIO DATA -------------------------------- #
    @socketio.on("audio_data", namespace=NAMESPACE)
    def handle_audio_data(data):
        """Handle audio data from browser."""
        session_id = session.get("realtime_session_id")
        if session_id is None:
            emit("error", {"message": "No session available"})
            return

        try:
            from pitext_travel.api.realtime.session_manager import get_session_manager

            manager = get_session_manager()
            realtime_session = manager.get_session(session_id)
            if realtime_session and realtime_session.client:
                audio_b64 = data.get("audio")
                if not audio_b64:
                    return
                audio_bytes = base64.b64decode(audio_b64)
                realtime_session.client.send_audio(audio_bytes)
                manager.update_session_stats(session_id, audio_sent=len(audio_bytes))
                
        except Exception as exc:
            logger.exception("Error handling audio data: %s", exc)
            emit("error", {"message": "Failed to process audio"})

    # ------------------------------ COMMIT AUDIO ----------------------------- #
    @socketio.on("commit_audio", namespace=NAMESPACE)
    def handle_commit_audio():
        """Commit audio buffer and request response."""
        session_id = session.get("realtime_session_id")
        if session_id is None:
            return

        try:
            from pitext_travel.api.realtime.session_manager import get_session_manager

            realtime_session = get_session_manager().get_session(session_id)
            if realtime_session and realtime_session.client:
                realtime_session.client.commit_audio()
                logger.debug(f"Audio committed for session {session_id}")
        except Exception as exc:
            logger.exception("Error committing audio: %s", exc)

    # ------------------------------- INTERRUPT ------------------------------- #
    @socketio.on("interrupt", namespace=NAMESPACE)
    def handle_interrupt():
        """Handle interrupt request."""
        session_id = session.get("realtime_session_id")
        if session_id is None:
            return

        try:
            from pitext_travel.api.realtime.session_manager import get_session_manager

            realtime_session = get_session_manager().get_session(session_id)
            if realtime_session and realtime_session.client:
                realtime_session.client.interrupt()
                emit("interrupted", {"status": "interrupted"})
                logger.info(f"Interrupt sent for session {session_id}")
        except Exception as exc:
            logger.exception("Error handling interrupt: %s", exc)

    # ---------------------------- MAP READY ---------------------------------- #
    @socketio.on("map_ready", namespace=NAMESPACE)
    def handle_map_ready():
        """Handle map ready event."""
        session_id = session.get("realtime_session_id")
        from pitext_travel.api.realtime.session_manager import get_session_manager
        if not session_id:
            return
        rt_session = get_session_manager().get_session(session_id)
        if rt_session:
            rt_session.client.send_text("Please read the itinerary overview now.")

    # ---------------------------- DEBUG ENDPOINTS ---------------------------- #
    @socketio.on("get_stats", namespace=NAMESPACE)
    def handle_get_stats():
        """Get session statistics for debugging."""
        session_id = session.get("realtime_session_id")
        if session_id is None:
            emit("stats", {"error": "No session"})
            return
            
        try:
            from pitext_travel.api.realtime.session_manager import get_session_manager
            
            manager = get_session_manager()
            realtime_session = manager.get_session(session_id)
            
            if realtime_session:
                stats = {
                    "session_id": session_id,
                    "is_active": realtime_session.is_active,
                    "created_at": realtime_session.created_at.isoformat(),
                    "last_activity": realtime_session.last_activity.isoformat(),
                    "audio_sent_kb": realtime_session.audio_bytes_sent / 1024,
                    "audio_received_kb": realtime_session.audio_bytes_received / 1024,
                    "message_count": realtime_session.message_count,
                    "function_calls": realtime_session.function_calls
                }
                emit("stats", stats)
            else:
                emit("stats", {"error": "Session not found"})
                
        except Exception as exc:
            logger.exception("Error getting stats: %s", exc)
            emit("stats", {"error": str(exc)})    
    logger.info("WebSocket handlers registered successfully")