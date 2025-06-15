"""Flask routes for the travel planner application.
All routes are grouped under the /travel prefix.
"""
import os
from flask import Blueprint, render_template, jsonify, request
from pitext_travel.api.llm import generate_trip_itinerary
from pitext_travel.api.config import get_google_maps_config


def create_travel_blueprint(base_dir):
    """Create and configure the travel blueprint.
    
    Args:
        base_dir: Absolute path to the application directory
    
    Returns:
        Configured Flask Blueprint
    """
    travel_bp = Blueprint(
        "travel",
        __name__,
        #url_prefix="/travel",
        template_folder=os.path.join(base_dir, 'templates')
    )

    @travel_bp.route("/", strict_slashes=False)
    def index():
        """Landing page for the Travel Planner micro-app."""
        return render_template("map.html")

    @travel_bp.route("/api/config", methods=["GET"])
    def get_config():
        """Serve configuration including Google Maps credentials."""
        config = get_google_maps_config()
        
        # Check for either API key or Client ID setup
        api_key = config["api_key"]
        client_id = config["client_id"]
        
        # Provide debugging info (without exposing full credentials)
        debug_info = {
            "has_api_key": bool(api_key and api_key.strip()),
            "has_client_id": bool(client_id and client_id.strip()),
            "api_key_length": len(api_key) if api_key else 0,
            "client_id_prefix": client_id[:10] + "..." if client_id and len(client_id) > 10 else client_id
        }
        
        print(f"Maps config debug: {debug_info}")
        
        return jsonify({
            "google_maps_api_key": api_key,
            "google_maps_client_id": client_id,
            "auth_type": "client_id" if client_id else "api_key",
            "debug": debug_info
        })

    @travel_bp.route("/api/itinerary", methods=["GET", "POST"])
    def get_itinerary():
        """Generate a travel itinerary using the OpenAI API."""
        if request.method == "POST":
            payload = request.get_json(force=True) or {}
            city = payload.get("city", "Paris")
            days = int(payload.get("days", 3))
        else:
            city, days = "Paris", 3
            
    @travel_bp.route("/debug", methods=["GET"])
    def debug_info():
        """Debug information about the server state."""
        return jsonify({
            "server_running": True,
            "socketio_available": True,
            "voice_endpoints": ["/travel/ws"],
            "api_endpoints": ["/api/config", "/api/itinerary"],
            "debug_endpoints": ["/test-socketio"]
        })

        try:
            itinerary = generate_trip_itinerary(city, days)
            return jsonify(itinerary)
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    return travel_bp