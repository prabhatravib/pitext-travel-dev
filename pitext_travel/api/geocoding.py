# pitext_travel/api/geocoding.py
from __future__ import annotations

import logging
from typing import List, Dict, Any
import time
from functools import lru_cache

# ─── existing imports ───────────────────────────────────────────────────────────
import googlemaps
from pitext_travel.api.config import get_google_maps_config
# from pitext_travel.api.models import DayPlan, Stop   # optional – only if you use dataclasses

logger = logging.getLogger(__name__)

_gmaps: googlemaps.Client | None = None
_geocoding_cache: Dict[str, tuple[float, float]] = {}

def _get_client() -> googlemaps.Client:
    """Return a cached googlemaps.Client instance."""
    global _gmaps
    if _gmaps is None:
        try:
            cfg = get_google_maps_config()
            api_key = cfg.get("api_key", "")
            if not api_key:
                logger.error("No Google Maps API key found in config")
                return None
            logger.info(f"Initializing Google Maps client with key: {api_key[:10]}...")
            _gmaps = googlemaps.Client(key=api_key)
        except Exception as e:
            logger.error(f"Failed to initialize Google Maps client: {e}")
            return None
    return _gmaps

@lru_cache(maxsize=1000)
def get_coordinates_for_place(place: str) -> tuple[float, float] | None:
    """Resolve a free-text place name to (lat, lng) or None if not found.
    
    Now uses LRU cache for better performance.
    """
    try:
        client = _get_client()
        if client is None:
            logger.error("No Google Maps client available")
            return None
            
        logger.debug(f"Geocoding place: {place}")
        results = client.geocode(place, language="en")
        
        if not results:
            logger.warning(f"No results found for place: {place}")
            return None
            
        loc = results[0]["geometry"]["location"]
        logger.debug(f"Geocoded {place} to {loc['lat']}, {loc['lng']}")
        return loc["lat"], loc["lng"]
    except Exception as e:
        logger.error(f"Geocoding error for '{place}': {e}")
        return None

def batch_geocode_places(places: List[str], city: str = "") -> Dict[str, tuple[float, float]]:
    """Geocode multiple places efficiently with caching and batching.
    
    Args:
        places: List of place names to geocode
        city: Optional city context for better results
        
    Returns:
        Dictionary mapping place names to (lat, lng) coordinates
    """
    results = {}
    start_time = time.time()
    
    for place in places:
        # Check cache first
        if place in _geocoding_cache:
            results[place] = _geocoding_cache[place]
            continue
            
        # Add city context for better results
        query = f"{place}, {city}" if city else place
        
        coords = get_coordinates_for_place(query)
        if coords:
            results[place] = coords
            _geocoding_cache[place] = coords  # Cache the result
        else:
            logger.warning(f"Failed to geocode '{place}'")
    
    duration = time.time() - start_time
    logger.info(f"Batch geocoded {len(places)} places in {duration:.2f}s")
    
    return results

# ────────────────────────────────────────────────────────────────────────────────
# NEW: itinerary post-processor
# ────────────────────────────────────────────────────────────────────────────────
def enhance_itinerary_with_geocoding(itinerary: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Attach latitude / longitude to every stop in the itinerary.

    The function is intentionally lenient:
    * Accepts a list of plain dicts (e.g. JSON from GPT) **or**
      a list of dataclass instances that expose .stops or .location.
    * Adds two keys – "lat" and "lng" – to each stop dict; if the stop
      already has them, they are left untouched.
    * Logs missing or failed look-ups but never raises, so the caller
      can still render the rest of the trip.

    Returns the **same list object** for convenience.
    """
    # Collect all place names for batch geocoding
    all_places = []
    place_to_stop_map = {}
    
    for day_idx, day in enumerate(itinerary):
        # Each day can be a dict or a dataclass – handle both.
        stops = None
        if isinstance(day, dict):
            stops = day.get("stops") or day.get("locations")
        else:  # dataclass / object – fall back to attribute access
            stops = getattr(day, "stops", None) or getattr(day, "locations", None)

        if not stops:
            continue

        for stop_idx, stop in enumerate(stops):
            # Stop can be dict or object; normalise to dict-like API.
            name = stop["name"] if isinstance(stop, dict) else getattr(stop, "name", "")
            if not name:
                continue

            # Check if valid coords already present (not null/None)
            has_valid_coords = False
            if isinstance(stop, dict):
                lat = stop.get("lat")
                lng = stop.get("lng")
                has_valid_coords = lat is not None and lng is not None and lat != "null" and lng != "null"
            else:
                lat = getattr(stop, "lat", None)
                lng = getattr(stop, "lng", None)
                has_valid_coords = lat is not None and lng is not None and lat != "null" and lng != "null"
            
            if has_valid_coords:
                logger.debug(f"Skipping geocoding for '{name}' - already has valid coordinates")
                continue

            # Add to batch geocoding list
            all_places.append(name)
            place_to_stop_map[name] = (day_idx, stop_idx, stop)
    
    # Batch geocode all places
    if all_places:
        logger.info(f"Batch geocoding {len(all_places)} places...")
        geocoded_results = batch_geocode_places(all_places)
        
        # Apply results back to stops
        for place_name, coords in geocoded_results.items():
            day_idx, stop_idx, stop = place_to_stop_map[place_name]
            lat, lng = coords
            
            if isinstance(stop, dict):
                stop["lat"] = lat
                stop["lng"] = lng
            else:
                setattr(stop, "lat", lat)
                setattr(stop, "lng", lng)

    return itinerary

# Re-export for clean imports elsewhere
__all__ = [
    "get_coordinates_for_place",
    "enhance_itinerary_with_geocoding",
    "batch_geocode_places",
]
