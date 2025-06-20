"""
PiText-Travel - main application entry point
"""
import eventlet
eventlet.monkey_patch()

import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, render_template
from flask_cors import CORS
from flask_socketio import SocketIO

# ------------------------------------------------------------------------------
# Environment & logging
# ------------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))        # make local imports reliable

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

# Suppress verbose socketio/engineio logs
logging.getLogger('socketio').setLevel(logging.WARNING)
logging.getLogger('engineio').setLevel(logging.WARNING)
logging.getLogger('socketio.server').setLevel(logging.WARNING) 
logging.getLogger('engineio.server').setLevel(logging.WARNING)
# ------------------------------------------------------------------------------
# Flask -- templates & static live under pitext_travel/
# ------------------------------------------------------------------------------
app = Flask(
    __name__,
    template_folder=str(BASE_DIR / "pitext_travel" / "templates"),
    static_folder=str(BASE_DIR / "pitext_travel" / "static"),
)

app.secret_key = os.getenv("FLASK_SECRET_KEY", os.urandom(32).hex())
if "FLASK_SECRET_KEY" not in os.environ:
    logger.warning("No FLASK_SECRET_KEY found. Generated a temporary key.")

app.config.update(
    SESSION_COOKIE_SECURE=False,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    PERMANENT_SESSION_LIFETIME=86400,
)

# CORS for local dev / front-end requests
CORS(app, origins="*", supports_credentials=True)

# ------------------------------------------------------------------------------
# Socket.IO
# ------------------------------------------------------------------------------
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="eventlet",
    logger=True,
    engineio_logger=True,
    path="socket.io",
    ping_timeout=60,
    ping_interval=25
)
logger.info("Socket.IO initialised (async_mode=eventlet)")

# ------------------------------------------------------------------------------
# Load blueprint + websocket handlers
# ------------------------------------------------------------------------------
blueprint_loaded = False
try:
    from pitext_travel.routes.travel import create_travel_blueprint
    from pitext_travel.routes.websocket import register_websocket_handlers

    travel_bp = create_travel_blueprint(str(BASE_DIR / "pitext_travel"))
    app.register_blueprint(travel_bp)

    register_websocket_handlers(socketio)

    blueprint_loaded = True
    logger.info("Successfully loaded routes and websocket handlers")

except ImportError as exc:
    logger.error("Failed to import modules: %s", exc)
    logger.error("Application will run with limited functionality")
except Exception as exc:
    logger.exception("Error setting up routes: %s", exc)

# ------------------------------------------------------------------------------
# Routes
# ------------------------------------------------------------------------------
@app.route("/")
def index():
    """Root route."""
    if blueprint_loaded:
        return render_template("map.html")

    # Fallback HTML if blueprint fails to load
    return (
        f"""<!DOCTYPE html>
        <html>
        <head><title>PiText Travel</title></head>
        <body>
            <h1>PiText Travel Service</h1>
            <p>The service is running but some components failed to load.</p>
            <p>Blueprint loaded: {blueprint_loaded}</p>
            <p>Check the logs for more details.</p>
        </body>
        </html>""",
        200,
        {"Content-Type": "text/html"},
    )


@app.route("/health")
def health():
    """Health-check endpoint."""
    return {"status": "ok", "blueprint_loaded": blueprint_loaded}


@app.route("/debug")
def debug():
    """Basic JSON diagnostics."""
    return {
        "status": "ok",
        "socketio_initialized": True,
        "blueprint_loaded": blueprint_loaded,
        "endpoints": {
            "websocket_test": "/test-socketio",
            "websocket_namespace": "/travel/ws",
        },
    }

# ------------------------------------------------------------------------------
# Default namespace events
# ------------------------------------------------------------------------------
@socketio.on("connect")
def _connect():
    logger.info("🔗 Client connected to default namespace (this should not happen for voice chat)")


@socketio.on("disconnect")
def _disconnect():
    logger.info("🔌 Client disconnected from default namespace")

# ------------------------------------------------------------------------------
# Entrypoint
# ------------------------------------------------------------------------------
if __name__ == "__main__":
    host  = os.getenv("HOST", "0.0.0.0")
    port  = int(os.getenv("PORT", 5000))
    is_debug = os.getenv("FLASK_ENV") == "development"

    logger.info("Starting travel app on %s:%s", host, port)
    logger.info("Debug mode: %s", is_debug)
    logger.info("Blueprint loaded: %s", blueprint_loaded)

    socketio.run(app, host=host, port=port, debug=is_debug, allow_unsafe_werkzeug=True)

# For ASGI servers
__all__ = ["app", "socketio"]
