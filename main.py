"""
PiText‑Travel – main application entry point
"""

import os
import logging
import sys

from flask import Flask, redirect, url_for, render_template
from flask_cors import CORS
from flask_socketio import SocketIO
from dotenv import load_dotenv

# Add current directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Environment & logging
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Flask initialisation
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

# Socket.IO – ASGI mode
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="threading",
    logger=True,
    engineio_logger=False,
    path="socket.io/",
)
logger.info("Socket.IO initialised (async_mode=threading)")

# Try to load blueprints and websocket handlers
# Try to load blueprints and websocket handlers
blueprint_loaded = False
travel_bp = None
try:
    from pitext_travel.routes.travel import create_travel_blueprint
    from pitext_travel.routes.websocket import register_websocket_handlers
    
    base_dir = os.path.dirname(os.path.abspath(__file__))
    travel_bp = create_travel_blueprint(base_dir)
    app.register_blueprint(travel_bp)
    register_websocket_handlers(socketio)
    
    blueprint_loaded = True
    logger.info("Successfully loaded routes and websocket handlers")
    
except ImportError as e:
    logger.error(f"Failed to import modules: {e}")
    logger.error("Application will run with limited functionality")
except Exception as e:
    logger.error(f"Error setting up routes: {e}")

# Routes
@app.route("/")
def index():
    
    """Root route"""
    if blueprint_loaded and travel_bp:
        # Serve the map template directly
        try:
            template_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'templates')
            app.template_folder = template_path
            return render_template('map.html')
        except Exception as e:
            logger.error(f"Template error: {e}")
    
    # Fallback: serve simple HTML
    return f"""
    <!DOCTYPE html>
    <html>
    <head><title>PiText Travel</title></head>
    <body>
        <h1>PiText Travel Service</h1>
        <p>The service is running but some components failed to load.</p>
        <p>Blueprint loaded: {blueprint_loaded}</p>
        <p>Check the logs for more details.</p>
    </body>
    </html>
    """@app.route("/health")
def health():
    """Health check endpoint"""
    return {"status": "ok", "blueprint_loaded": blueprint_loaded}

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
        "blueprint_loaded": blueprint_loaded,
        "endpoints": {
            "websocket_test": "/test-socketio",
            "websocket_namespace": "/travel/ws",
        },
    }

# Default namespace events
@socketio.on("connect")
def _connect():
    logger.info("Client connected to default namespace")

@socketio.on("disconnect")
def _disconnect():
    logger.info("Client disconnected from default namespace")

# Main execution
if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    host = os.getenv("HOST", "0.0.0.0")
    debug = os.getenv("FLASK_ENV") == "development"
    
    logger.info(f"Starting travel app on {host}:{port}")
    logger.info(f"Debug mode: {debug}")
    logger.info(f"Blueprint loaded: {blueprint_loaded}")
    
    socketio.run(app, host=host, port=port, debug=False, allow_unsafe_werkzeug=True)

# Export for ASGI servers
__all__ = ["app", "socketio"]