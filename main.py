"""
PiText‑Travel – main application entry point

* Flask app + Socket.IO 5 exposed as an **ASGI** application so it can be mounted
  by the root monorepo service that already runs under Uvicorn.
* No eventlet/gevent required. Everything runs on the default asyncio loop.
* The Socket.IO path is `/socket.io/`, which must be used by the
  JavaScript client.
"""

import os
import logging

from flask import Flask
from flask_cors import CORS
from flask_socketio import SocketIO
from dotenv import load_dotenv

# --------------------------------------------------------------------------- #
# Environment & logging
# --------------------------------------------------------------------------- #
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
# Flask initialisation
# --------------------------------------------------------------------------- #
app = Flask(__name__)

flask_secret_key = os.getenv("FLASK_SECRET_KEY") or os.urandom(32).hex()
if "FLASK_SECRET_KEY" not in os.environ:
    logger.warning("No FLASK_SECRET_KEY found. Generated a temporary key.")
app.secret_key = flask_secret_key

app.config.update(
    SESSION_COOKIE_SECURE=False,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    PERMANENT_SESSION_LIFETIME=86400,
)

# CORS for local dev / cross‑origin front‑end requests
CORS(app, origins="*", supports_credentials=True)

# --------------------------------------------------------------------------- #
# Socket.IO – ASGI mode
# --------------------------------------------------------------------------- #
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="threading",
    logger=True,
    engineio_logger=False,
    path="socket.io/",
)
logger.info("Socket.IO initialised (async_mode=threading)")

# --------------------------------------------------------------------------- #
# Blueprints & WebSocket handlers
# --------------------------------------------------------------------------- #
try:
    from pitext_travel.routes.travel import create_travel_blueprint
    from pitext_travel.routes.websocket import register_websocket_handlers
    
    base_dir = os.path.dirname(os.path.abspath(__file__))
    app.register_blueprint(create_travel_blueprint(base_dir))
    register_websocket_handlers(socketio)
    
except ImportError as e:
    logger.error(f"Failed to import modules: {e}")
    logger.error("Make sure you're running from the correct directory")

# --------------------------------------------------------------------------- #
# Diagnostic routes (optional)
# --------------------------------------------------------------------------- #
@app.route("/")
def index():
    """Root route - redirect to travel interface"""
    from flask import redirect, url_for
    return redirect(url_for('travel.index'))

@app.route("/test-socketio")
def test_socketio():
    """Return a tiny HTML page that attempts a Socket.IO handshake."""
    return """
    <!DOCTYPE html>
    <html>
    <head><title>Socket.IO Test</title></head>
    <body>
      <h1>Socket.IO Connection Test</h1>
      <div id="status">Connecting...</div>
      <div id="log"></div>
      <script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
      <script>
        const log    = document.getElementById('log');
        const status = document.getElementById('status');
        function add(msg) { log.innerHTML += `<p>${new Date().toISOString()}: ${msg}</p>`; }

        add('Attempting to connect...');

        const socket = io('/travel/ws', {
          path: '/socket.io/',
          transports: ['polling','websocket']
        });

        socket.on('connect',      () => { status.textContent = '✅ Connected';      add('Connected'); });
        socket.on('disconnect',   r  => { status.textContent = `❌ Disconnect: ${r}`; add(`Disconnect: ${r}`); });
        socket.on('connect_error',e  => { status.textContent = `❌ Error: ${e.message}`; add(`Error: ${e.message}`); });
      </script>
    </body>
    </html>
    """

@app.route("/debug")
def debug():
    """Simple JSON health endpoint."""
    return {
        "status": "ok",
        "socketio_initialized": True,
        "endpoints": {
            "websocket_test": "/test-socketio",
            "websocket_namespace": "/travel/ws",
        },
    }

# --------------------------------------------------------------------------- #
# Default namespace events (optional logging)
# --------------------------------------------------------------------------- #
@socketio.on("connect")
def _connect():
    logger.info("Client connected to default namespace")

@socketio.on("disconnect")
def _disconnect():
    logger.info("Client disconnected from default namespace")

# --------------------------------------------------------------------------- #
# Main execution
# --------------------------------------------------------------------------- #
if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    logger.info("Starting travel app on http://localhost:%d", port)
    socketio.run(app, host="0.0.0.0", port=port, debug=False, allow_unsafe_werkzeug=True)

# --------------------------------------------------------------------------- #
# Export for ASGI servers
# --------------------------------------------------------------------------- #
__all__ = ["app", "socketio"]