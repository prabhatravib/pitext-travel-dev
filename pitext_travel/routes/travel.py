# pitext_travel/routes/travel.py
"""Travel routes and blueprint configuration."""

import os
from flask import Blueprint, render_template, jsonify, request, session
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
        template_folder=os.path.join(base_dir, 'templates'),
        static_folder=os.path.join(base_dir, 'static'),
        static_url_path='/static',
        url_prefix="/travel"
    )
    
    @travel_bp.route("/")
    def index():
        """Main travel planner page."""
        return render_template("map.html")
    
    @travel_bp.route("/api/config")
    def api_config():
        """Return Google Maps configuration for frontend."""
        config = get_google_maps_config()
        
        # Determine auth type and prepare response
        if config.get("api_key"):
            # API Key authentication
            return jsonify({
                "auth_type": "api_key",
                "google_maps_api_key": config["api_key"],
                "google_maps_client_id": config.get("client_id", ""),
                "client_secret_configured": bool(config.get("client_secret"))
            })
        else:
            return jsonify({
                "error": "No Google Maps API key configured"
            }), 500
    
    @travel_bp.route("/api/itinerary", methods=["GET", "POST"])
    def api_itinerary():
        """Generate or retrieve itinerary."""
        if request.method == "POST":
            # Generate new itinerary
            data = request.get_json()
            city = data.get("city", "Paris")
            days = data.get("days", 3)
            
            try:
                itinerary = {
                                "days": generate_trip_itinerary(city, days),
                                "metadata": {"city": city, "days": days}
                            }

                # Store in session
                session['current_itinerary'] = itinerary
                session['current_city'] = city
                session['current_days'] = days
                
                return jsonify(itinerary)
            except Exception as e:
                return jsonify({"error": str(e)}), 500
        else:
            # Retrieve existing itinerary from session
            itinerary = session.get('current_itinerary')
            if itinerary:
                return jsonify(itinerary)
            else:
                # Return default itinerary
                    itinerary = {
                                "days": generate_trip_itinerary("Paris", 3),
                                "metadata": {"city": "Paris", "days": 3}
                            }
            return jsonify(itinerary)
    
    @travel_bp.route("/test-namespace")
    def test_namespace():
        """Test if the /travel/ws namespace is properly registered."""
        return """
        <!DOCTYPE html>
        <html>
        <head><title>Namespace Test</title></head>
        <body>
          <h1>Namespace Registration Test</h1>
          <div id="status">Testing...</div>
          <div id="log"></div>
          <script src="https://cdn.socket.io/4.7.4/socket.io.min.js"></script>
          <script>
            const status = document.getElementById('status');
            const log = document.getElementById('log');
            function add(msg){ log.innerHTML += `<p>${new Date().toISOString()}: ${msg}</p>`; }

            add('Testing namespace registration...');
            
            // Test 1: Try to connect to /travel/ws
            add('Attempting to connect to /travel/ws...');
            const travelSocket = io('/travel/ws', { 
              path: '/socket.io',
              transports: ['polling'],
              timeout: 5000
            });

            travelSocket.on('connect', () => {
              add('✅ SUCCESS: Connected to /travel/ws namespace');
              status.textContent = 'Namespace is working!';
              
              // Test ping
              travelSocket.emit('ping');
            });
            
            travelSocket.on('pong', (data) => {
              add(`✅ PING/PONG working: ${JSON.stringify(data)}`);
            });
            
            travelSocket.on('connect_error', (e) => {
              add(`❌ FAILED to connect to /travel/ws: ${e.message}`);
              status.textContent = 'Namespace registration failed';
            });
            
            // Test 2: Also test default namespace
            add('Also testing default namespace...');
            const defaultSocket = io('/', { 
              path: '/socket.io',
              transports: ['polling'],
              timeout: 5000
            });
            
            defaultSocket.on('connect', () => {
              add('⚠️ Connected to default namespace (this might be the fallback)');
            });
            
            defaultSocket.on('connect_error', (e) => {
              add(`❌ Default namespace also failed: ${e.message}`);
            });
          </script>
        </body>
        </html>
        """
    
    @travel_bp.route("/health")
    def health():
        """Health check endpoint."""
        return jsonify({"status": "ok", "service": "travel"})
    
    return travel_bp


# Export for backward compatibility
__all__ = ['create_travel_blueprint']