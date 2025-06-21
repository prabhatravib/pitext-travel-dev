"""Google Maps geocoding helpers.

This module intentionally avoids importing *generate_trip_itinerary* or
anything else from llm.py at run‑time to prevent circular imports.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import googlemaps

from pitext_travel.api.config import get_google_maps_api_key

if TYPE_CHECKING:  # Imported only for static type‑checking
    from pitext_travel.api.models import Stop, Itinerary

logger = logging.getLogger(__name__)


def _lookup_location(gmaps: googlemaps.Client, query: str) -> tuple[float, float] | None:
    """Return (lat, lng) for the given address or place name, if found."""
    try:
        result = gmaps.geocode(query, language="en", region="us", limit=1)
        if result:
            loc = result[0]["geometry"]["location"]
            return float(loc["lat"]), float(loc["lng"])
    except Exception as exc:  # broad except because Google client raises many
        logger.warning("Geocode lookup failed for %s: %s", query, exc)
    return None


def enhance_itinerary_with_geocoding(itinerary: list[dict]) -> list[dict]:
    """Populate each stop with latitude/longitude (in‑place) and return the itinerary."""
    api_key = get_google_maps_api_key()
    if not api_key:
        logger.warning("GOOGLE_MAPS_KEY not configured; skipping geocoding.")
        return itinerary

    gmaps = googlemaps.Client(key=api_key, timeout=5)

    for day in itinerary:
        for stop in day.get("stops", []):
            # Only geocode if the coordinates are missing
            if stop.get("lat") is None or stop.get("lng") is None:
                coords = _lookup_location(gmaps, stop["name"])
                if coords:
                    stop["lat"], stop["lng"] = coords
                else:
                    logger.debug("No coordinates found for %s", stop["name"])

    return itinerary
