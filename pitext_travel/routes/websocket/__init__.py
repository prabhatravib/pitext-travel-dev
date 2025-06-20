# pitext_travel/routes/websocket/__init__.py
"""WebSocket route handlers initialization."""

import logging

from .connection import ConnectionHandler
from .audio import AudioHandler
from .session import SessionHandler
from .base import NAMESPACE

logger = logging.getLogger(__name__)


def register_websocket_handlers(socketio):
    """Register all WebSocket event handlers with SocketIO.
    
    This replaces the original single large register_websocket_handlers
    function by delegating to specialized handler classes.
    
    Args:
        socketio: Flask-SocketIO instance
    """
    logger.info("Registering enhanced WebSocket handlers...")
    
    # Initialize handler instances
    connection_handler = ConnectionHandler(socketio, NAMESPACE)
    audio_handler = AudioHandler(socketio, NAMESPACE)
    session_handler = SessionHandler(socketio, NAMESPACE)
    
    # Register handlers from each module
    connection_handler.register_handlers()
    audio_handler.register_handlers()
    session_handler.register_handlers()
    
    logger.info("✅ Enhanced WebSocket handlers registered successfully")


# Export for backward compatibility
__all__ = ['register_websocket_handlers', 'NAMESPACE']