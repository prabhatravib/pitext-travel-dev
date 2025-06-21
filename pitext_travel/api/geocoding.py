# pitext_travel/api/geocoding.py
from __future__ import annotations

from typing import Tuple, Optional

import googlemaps

from pitext_travel.api.config import get_google_maps_config

# Lazy-initialised singleton Google Maps client
_gmaps: Optional[googlemaps.Client] = None


def _get_client() -> googlemaps.Client:
    """Return a cached googlemaps.Client instance."""
    global _gmaps
    if _gmaps is None:
        cfg = get_google_maps_config()          # expects {"api_key": "..."}
        _gmaps = googlemaps.Client(key=cfg["api_key"])
    return _gmaps


def get_coordinates_for_place(place: str) -> Optional[Tuple[float, float]]:
    """
    Resolve a free-text place name to (latitude, longitude).

    Returns None if the place cannot be geocoded.
    """
    client = _get_client()
    results = client.geocode(place, language="en")
    if not results:
        return None

    loc = results[0]["geometry"]["location"]  # {'lat': ..., 'lng': ...}
    return loc["lat"], loc["lng"]
