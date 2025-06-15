# pitext_travel/routes/__init__.py
from flask_socketio import SocketIO

# bare instance—no app passed here
socketio = SocketIO(
    cors_allowed_origins="*",
    async_mode="eventlet",
    logger=True,
    engineio_logger=True
)
NAMESPACE = "/travel/ws"
