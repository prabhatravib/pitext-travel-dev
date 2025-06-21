# pitext_travel/api/geocoding.py
from __future__ import annotations

import logging
from typing import List, Dict, Any

# ─── existing imports ───────────────────────────────────────────────────────────
import googlemaps
from pitext_travel.api.config import get_google_maps_config
# from pitext_travel.api.models import DayPlan, Stop   # optional – only if you use dataclasses

logger = logging.getLogger(__name__)

_gmaps: googlemaps.Client | None = None


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

def get_coordinates_for_place(place: str) -> tuple[float, float] | None:
    """Resolve a free-text place name to (lat, lng) or None if not found."""
    try:
        client = _get_client()
        if client is None:
            logger.error("No Google Maps client available")
            return None
            
        logger.info(f"Geocoding place: {place}")
        results = client.geocode(place, language="en")
        
        if not results:
            logger.warning(f"No results found for place: {place}")
            return None
            
        loc = results[0]["geometry"]["location"]
        logger.info(f"Geocoded {place} to {loc['lat']}, {loc['lng']}")
        return loc["lat"], loc["lng"]
    except Exception as e:
        logger.error(f"Geocoding error for '{place}': {e}")
        return None

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
    for day in itinerary:
        # Each day can be a dict or a dataclass – handle both.
        stops = None
        if isinstance(day, dict):
            stops = day.get("stops") or day.get("locations")
        else:  # dataclass / object – fall back to attribute access
            stops = getattr(day, "stops", None) or getattr(day, "locations", None)

        if not stops:
            continue

        for stop in stops:
            # Stop can be dict or object; normalise to dict-like API.
            name = stop["name"] if isinstance(stop, dict) else getattr(stop, "name", "")
            if not name:
                continue

            # Skip if coords already present
            has_coords = (
                ("lat" in stop and "lng" in stop) if isinstance(stop, dict)
                else hasattr(stop, "lat") and hasattr(stop, "lng")
            )
            if has_coords:
                continue

            coords = get_coordinates_for_place(name)
            if coords is None:
                logger.warning("Geocoding failed for '%s'", name)
                continue

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
]
