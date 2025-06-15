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
from pitext_travel.api.realtime.session_manager import get_session_manager
from pitext_travel.routes import socketio, NAMESPACE

logger = logging.getLogger(__name__)


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
                binary=False,  # payload already base64
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
                    "role": "assistant"  # Add role for frontend
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
            
            # Get the function handler
            if hasattr(realtime_session, 'function_handler'):
                result = realtime_session.function_handler.handle_function_call(
                    call_id, name, args
                )
                
                # Send result back to Realtime API
                realtime_session.client.send_function_result(call_id, result)
                
                # If it's a trip planning result, emit to frontend
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
                    # Handle explain_day which needs session data
                    flask_session = session
                    if 'current_itinerary' in flask_session:
                        voice_response = realtime_session.function_handler.format_explain_day_response(
                            flask_session['current_itinerary'],
                            flask_session.get('current_city', 'your destination'),
                            result.get('day_number', 0)
                        )
                        
                        # Update the result with the formatted response
                        result['voice_response'] = voice_response
                        
                        # Send updated result back
                        realtime_session.client.send_function_result(call_id, result)
            else:
                logger.error(f"No function handler available for session {realtime_session.session_id}")
                
        except Exception as exc:
            logger.exception("Failed handling function call: %s", exc)
            # Send error result back to Realtime API
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


# --------------------------------------------------------------------------- #
# Public API: register all WebSocket handlers                                 #
# --------------------------------------------------------------------------- #
def register_websocket_handlers(socketio) -> None:
    """Attach every Socket.IO event handler for the *travel* namespace."""
    logger.info("Registering WebSocket handlers…")

    NAMESPACE = "/travel/ws"

    # ------------------------------ CONNECT ---------------------------------- #
    @socketio.on("connect", namespace=NAMESPACE)
    def handle_connect(auth):  # noqa: ANN001
        user_ip = request.remote_addr
        origin = request.headers.get("Origin", "unknown")
        logger.info("WebSocket connected from %s (origin: %s)", user_ip, origin)

        try:
            # Lazy import avoids circulars
            from pitext_travel.api.realtime.session_manager import get_session_manager

            flask_sid = session.get("_id", "anonymous")
            manager = get_session_manager()

            realtime_session = manager.get_session_by_flask_id(flask_sid)
            if realtime_session is None:
                realtime_session = manager.create_session(user_ip, flask_sid)
                if realtime_session is None:  # rate-limited or at capacity
                    emit(
                        "error",
                        {
                            "message": "Rate limit exceeded or server at capacity"
                        },
                    )
                    disconnect()
                    return

            session["realtime_session_id"] = realtime_session.session_id

            logger.info("Session created: %s", realtime_session.session_id)
            emit(
                "connected",
                {
                    "session_id": realtime_session.session_id,
                    "status": "connected",
                },
            )
        except Exception as exc:  # pragma: no cover
            logger.exception("Error in connect handler: %s", exc)
            emit("error", {"message": "Connection failed"})
            disconnect()

    # -------------------------- START REALTIME SESSION ----------------------- #
    @socketio.on("start_session", namespace=NAMESPACE)
    def handle_start_session(data):  # noqa: ANN001
        session_id = session.get("realtime_session_id")
        if not session_id:
            emit("error", {"message": "No session available"})
            return

        try:
            from pitext_travel.api.realtime.session_manager import get_session_manager
            from pitext_travel.api.realtime.function_handler import create_function_handler

            manager = get_session_manager()
            realtime_session = manager.get_session(session_id)
            if realtime_session is None:
                emit("error", {"message": "Session not found"})
                return

            # Activate (ie, open WS to the OpenAI Realtime API)
            if not manager.activate_session(session_id):
                emit("error", {"message": "Failed to activate session"})
                return

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

    @socketio.on("commit_audio", namespace=NAMESPACE)
    def handle_commit_audio():
        """Freeze the audio buffer and ask the Realtime API to reply."""
        # 1) Look up the current rts_* session ID stored in flask.session
        session_id = session.get("realtime_session_id")
        if not session_id:
            return

        # 2) Grab the RealtimeClient wrapper for this session
        rt_session = get_session_manager().get_session(session_id)
        if not rt_session:
            return

        # 3) Tell the OpenAI client to commit and create a response
        rt_session.client.commit_audio()

        # pitext_travel/routes/websocket.py
    @socketio.on("map_ready", namespace=NAMESPACE)
    def handle_map_ready():
        session_id = session.get("realtime_session_id")
        from pitext_travel.api.realtime.session_manager import get_session_manager
        if not session_id:
            return
        rt_session = get_session_manager().get_session(session_id)
        if rt_session:
            # Ask OpenAI to deliver the pre-formatted voice_response now
            rt_session.client.send_text(
                "Please read the itinerary overview now."
            )


    # ----------------------------- AUDIO DATA -------------------------------- #
    @socketio.on("audio_data", namespace=NAMESPACE)
    def handle_audio_data(data):  # noqa: ANN001
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
                
                # Emit debug info periodically
                if realtime_session.message_count % 100 == 0:
                    logger.debug(f"Session {session_id} - Audio sent: {realtime_session.audio_bytes_sent / 1024:.1f}KB")
                    
        except Exception as exc:
            logger.exception("Error handling audio data: %s", exc)
            emit("error", {"message": "Failed to process audio"})

    # ------------------------------ COMMIT AUDIO ----------------------------- #
    @socketio.on("commit_audio", namespace=NAMESPACE)
    def handle_commit_audio():
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

    # ------------------------------ DISCONNECT ------------------------------- #
    @socketio.on("disconnect", namespace=NAMESPACE)
    def handle_disconnect():
        session_id = session.get("realtime_session_id")
        if session_id is None:
            return
        try:
            from pitext_travel.api.realtime.session_manager import get_session_manager

            get_session_manager().deactivate_session(session_id, "client_disconnect")
            logger.info("WebSocket disconnected, session %s deactivated", session_id)
        except Exception as exc:
            logger.exception("Error in disconnect handler: %s", exc)

    # --------------------------------- PING ---------------------------------- #
    @socketio.on("ping", namespace=NAMESPACE)
    def handle_ping():
        """Simple ping/pong to keep the connection alive."""
        emit("pong", {"timestamp": time.time()})

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