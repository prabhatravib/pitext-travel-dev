# api/geocoding.py
"""Google Maps geocoding and coordinate management."""
import logging
import random
import requests
from pitext_travel.api.config import get_google_maps_config

logger = logging.getLogger(__name__)

# City coordinates database
CITY_COORDS = {
    "paris": (48.8566, 2.3522),
    "london": (51.5074, -0.1278),
    "new york": (40.7128, -74.0060),
    "tokyo": (35.6762, 139.6503),
    "rome": (41.9028, 12.4964),
    "barcelona": (41.3851, 2.1734),
    "amsterdam": (52.3676, 4.9041),
    "berlin": (52.5200, 13.4050),
    "prague": (50.0755, 14.4378),
    "vienna": (48.2082, 16.3738),
    "budapest": (47.4979, 19.0402),
    "madrid": (40.4168, -3.7038),
    "lisbon": (38.7223, -9.1393),
    "dublin": (53.3498, -6.2603),
    "stockholm": (59.3293, 18.0686),
    "copenhagen": (55.6761, 12.5683),
    "oslo": (59.9139, 10.7522),
    "helsinki": (60.1699, 24.9384),
    "athens": (37.9838, 23.7275),
    "istanbul": (41.0082, 28.9784),
    "moscow": (55.7558, 37.6173),
    "dubai": (25.2048, 55.2708),
    "singapore": (1.3521, 103.8198),
    "hong kong": (22.3193, 114.1694),
    "sydney": (33.8688, 151.2093),
    "melbourne": (37.8136, 144.9631),
    "los angeles": (34.0522, -118.2437),
    "san francisco": (37.7749, -122.4194),
    "chicago": (41.8781, -87.6298),
    "miami": (25.7617, -80.1918),
    "toronto": (43.6532, -79.3832),
    "vancouver": (49.2827, -123.1207),
    "mexico city": (19.4326, -99.1332),
    "buenos aires": (34.6118, -58.3960),
    "rio de janeiro": (22.9068, -43.1729),
    "sao paulo": (23.5505, -46.6333),
    "cairo": (30.0444, 31.2357),
    "marrakech": (31.6295, -7.9811),
    "cape town": (33.9249, 18.4241),
    "mumbai": (19.0760, 72.8777),
    "delhi": (28.7041, 77.1025),
    "bangkok": (13.7563, 100.5018),
    "seoul": (37.5665, 126.9780),
    "beijing": (39.9042, 116.4074),
    "shanghai": (31.2304, 121.4737)
}

def get_place_details(place_name, city):
    """
    Use Google Places API Text Search to get coordinates and place types.
    """
    config = get_google_maps_config()
    google_api_key = config.get("api_key")
    
    if not google_api_key:
        logger.warning("No Google Maps API key found, using estimated coordinates")
        lat, lng = get_estimated_coordinates(city)
        return lat, lng, None, None

    try:
        url = "https://maps.googleapis.com/maps/api/place/textsearch/json"
        params = {
            "query": f"{place_name}, {city}",
            "key": google_api_key
        }
        
        response = requests.get(url, params=params, timeout=10)
        data = response.json()

        if data.get("status") == "OK" and data.get("results"):
            result = data["results"][0]
            location = result["geometry"]["location"]
            place_types = result.get("types", [])
            
            # Get the primary type for icon selection
            primary_type = place_types[0] if place_types else None
            
            logger.info(f"Found details for {place_name}: {location['lat']}, {location['lng']}, Types: {place_types}")
            return location["lat"], location["lng"], primary_type, place_types
        else:
            logger.warning(f"Places API search failed for {place_name}: {data.get('status', 'Unknown')}")
            lat, lng = get_estimated_coordinates(city)
            return lat, lng, None, None
            
    except Exception as e:
        logger.error(f"Places API error for {place_name}: {e}")
        lat, lng = get_estimated_coordinates(city)
        return lat, lng, None, None
def get_estimated_coordinates(city):
    """Get estimated coordinates for major cities"""
    # Add small random offset to avoid exact duplicates
    base_lat, base_lng = CITY_COORDS.get(city.lower(), (48.8566, 2.3522))
    offset = random.uniform(-0.01, 0.01)
    return base_lat + offset, base_lng + offset

def enhance_with_geocoding(itinerary, city):
    """Add accurate coordinates and place type to each stop."""
    enhanced = {"days": []}
    
    for day in itinerary.get("days", []):
        enhanced_day = {
            "label": day.get("label", "Day"),
            "color": day.get("color", "#4285f4"),
            "stops": []
        }
        
        for stop in day.get("stops", []):
            place_name = stop.get("name", "Unknown Place")
            # Get lat, lng, primary_type, and all types
            lat, lng, primary_type, place_types = get_place_details(place_name, city)
            
            enhanced_stop = {
                "name": place_name,
                "lat": lat,
                "lng": lng,
                "placeType": primary_type,  # Send place type to frontend
                "types": place_types  # Send all types for more options
            }
            enhanced_day["stops"].append(enhanced_stop)
            
        enhanced["days"].append(enhanced_day)
    
    return enhanced