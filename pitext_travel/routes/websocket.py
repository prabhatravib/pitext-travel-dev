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
                },
                room=sid,
                namespace=namespace,
            )
        except Exception as exc:
            logger.exception("Failed emitting transcript: %s", exc)

    client.on_audio_chunk = _on_audio_chunk
    client.on_transcript = _on_transcript
    # You can also wire: client.on_error, client.on_session_update, …


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

            manager = get_session_manager()
            realtime_session = manager.get_session(session_id)
            if realtime_session is None:
                emit("error", {"message": "Session not found"})
                return

            # Activate (ie, open WS to the OpenAI Realtime API)
            if not manager.activate_session(session_id):
                emit("error", {"message": "Failed to activate session"})
                return

            # Bridge callbacks → browser
            _wire_realtime_callbacks(socketio, realtime_session, request.sid, NAMESPACE)

            emit(
                "session_started",
                {
                    "session_id": session_id,
                    "status": "active",
                },
            )
            logger.info("Realtime session %s started", session_id)

        except Exception as exc:
            logger.exception("Error starting session: %s", exc)
            emit("error", {"message": "Failed to start session"})

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

    logger.info("WebSocket handlers registered successfully")
