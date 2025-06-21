# pitext_travel/routes/websocket/session.py
"""WebSocket handlers for session management and map integration."""

import logging
import time
from flask import request, session

from .base import BaseWebSocketHandler, NAMESPACE
from pitext_travel.routes.websocket.callback_helpers import wire_realtime_callbacks

logger = logging.getLogger(__name__)


class SessionHandler(BaseWebSocketHandler):
    """Handles session-related WebSocket events."""
    
    def register_handlers(self):
        """Register session-related event handlers."""
        
        @self.socketio.on("start_session", namespace=NAMESPACE)
        def handle_start_session(data):
            """Start OpenAI Realtime API session with enhanced initialization."""
            session_id = session.get("realtime_session_id")
            logger.info(f"🔍 start_session called - session_id: {session_id}, session keys: {list(session.keys())}")
            
            if not session_id:
                self.emit_to_client("error", {"message": "No session available"})
                logger.error("❌ No realtime_session_id in session")
                return

            try:
                from pitext_travel.api.realtime.session_manager import get_session_manager
                from pitext_travel.api.realtime.function_handler import create_function_handler

                manager = get_session_manager()
                realtime_session = manager.get_session(session_id)
                if realtime_session is None:
                    logger.error(f"❌ Session {session_id} not found in manager")
                    self.emit_to_client("error", {"message": "Session not found"})
                    return

                # Check if session is already active
                if realtime_session.is_active:
                    logger.info(f"🔄 Session {session_id} already active, skipping activation")
                    self.emit_to_client(
                        "session_started",
                        {
                            "session_id": session_id,
                            "status": "already_active",
                            "functions_registered": 2,  # Default function count
                            "timestamp": time.time()
                        },
                    )
                    return

                # Check if there's already an active session for this Flask session
                flask_session_id = session.get("_id", "anonymous")
                existing_active = manager.get_active_session_by_flask_id(flask_session_id)
                if existing_active and existing_active.session_id != session_id:
                    logger.warning(f"⚠️ Another active session {existing_active.session_id} exists for Flask session {flask_session_id}")
                    # Deactivate the other session first
                    manager.deactivate_session(existing_active.session_id, "replaced_by_new_session")

                # Activate (ie, open WS to the OpenAI Realtime API)
                logger.info(f"🚀 Activating session {session_id}...")
                if not manager.activate_session(session_id):
                    logger.error(f"❌ Failed to activate session {session_id}")
                    self.emit_to_client("error", {"message": "Failed to activate session"})
                    return

                logger.info(f"✅ Session {session_id} activated successfully")

                # Create and attach function handler
                function_handler = create_function_handler(flask_session_id)
                realtime_session.function_handler = function_handler
                
                # Get function definitions
                functions = function_handler.get_function_definitions()
                
                # Configure the Realtime session with travel functions
                logger.info(f"🔧 Registering {len(functions)} functions with Realtime API")
                realtime_session.client.update_session(
                    instructions=realtime_session.client.config["instructions"],
                    functions=functions,
                    temperature=realtime_session.client.config["temperature"]
                )

                # Bridge callbacks → browser
                wire_realtime_callbacks(self.socketio, realtime_session, request.sid, NAMESPACE)  # type: ignore

                self.emit_to_client(
                    "session_started",
                    {
                        "session_id": session_id,
                        "status": "active",
                        "functions_registered": len(functions),
                        "timestamp": time.time()
                    },
                )
                logger.info("✅ Realtime session %s started with %d functions", session_id, len(functions))

            except Exception as exc:
                self.handle_error(exc, "start_session")

        @self.socketio.on("map_ready", namespace=NAMESPACE)
        def handle_map_ready(data=None):
            """Handle map ready event with better integration."""
            session_id = session.get("realtime_session_id")
            if not session_id:
                return
            
            try:
                from pitext_travel.api.realtime.session_manager import get_session_manager
                
                manager = get_session_manager()
                rt_session = manager.get_session(session_id)
                
                if rt_session and rt_session.client:
                    # Check if welcome message already sent
                    if hasattr(rt_session, 'welcome_sent') and rt_session.welcome_sent:
                        logger.info(f"📍 Map ready, welcome already sent for session {session_id}")
                        return
                    
                    # Check if we have a current itinerary to announce
                    flask_session = session
                    if 'current_itinerary' in flask_session:
                        city = flask_session.get('current_city', 'your destination')
                        days = flask_session.get('current_days', 'several')
                        welcome_message = f"Great! I can see your {days}-day itinerary for {city} is displayed on the map. How can I help you with your trip planning?"
                    else:
                        welcome_message = "Hi! I'm ready to help you plan your trip. Just tell me which city you'd like to visit and for how many days."
                    
                    rt_session.client.send_text(welcome_message)
                    rt_session.welcome_sent = True  # Mark as sent
                    logger.info(f"📍 Map ready, sent welcome message for session {session_id}")
                    
            except Exception as exc:
                self.handle_error(exc, "map_ready")

        @self.socketio.on("get_stats", namespace=NAMESPACE)
        def handle_get_stats():
            """Get session statistics for debugging."""
            session_id = session.get("realtime_session_id")
            if session_id is None:
                self.emit_to_client("stats", {"error": "No session"})
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
                        "function_calls": realtime_session.function_calls,
                        "flask_session_data": {
                            "has_itinerary": 'current_itinerary' in session,
                            "current_city": session.get('current_city'),
                            "current_days": session.get('current_days')
                        }
                    }
                    self.emit_to_client("stats", stats)
                else:
                    self.emit_to_client("stats", {"error": "Session not found"})
                    
            except Exception as exc:
                self.handle_error(exc, "get_stats")