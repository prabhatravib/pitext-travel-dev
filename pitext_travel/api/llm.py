"""LLM helper functions for PiText‑Travel."""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List

import openai

from pitext_travel.api.config import (
    get_openai_api_key,
    get_openai_model_name,
)
from pitext_travel.api.geocoding import enhance_itinerary_with_geocoding

logger = logging.getLogger(__name__)
openai.api_key = get_openai_api_key()


# ---------------------------------------------------------------------------
# Itinerary generation
# ---------------------------------------------------------------------------

def _build_prompt(city: str, days: int) -> str:
    return (
        "You are a helpful travel planner. "
        f"Create a {days}-day itinerary for {city}. "
        "Reply in strict JSON with the schema: "
        "{\n  \"days\": [\n    {\n      \"day\": <int>, \"stops\": [\n        {\n          \"name\": <str>, \"address\": <str|null>, \"lat\": null, \"lng\": null\n        }\n      ]\n    }\n  ]\n}"
    )


def _parse_response(content: str) -> List[Dict[str, Any]]:
    try:
        payload = json.loads(content)
        return payload["days"]
    except (json.JSONDecodeError, KeyError) as exc:
        logger.error("Failed to parse LLM response: %s", exc)
        raise


def generate_trip_itinerary(city: str, days: int) -> List[Dict[str, Any]]:
    """Generate a JSON itinerary via the chat‑completion API and enrich with geocoding."""
    messages = [
        {"role": "system", "content": "You are ChatGPT."},
        {"role": "user", "content": _build_prompt(city, days)},
    ]

    logger.debug("Calling OpenAI model for itinerary: city=%s days=%d", city, days)
    response = openai.ChatCompletion.create(
        model=get_openai_model_name(),
        messages=messages,
        temperature=0.7,
        max_tokens=2048,
    )

    raw_content: str = response.choices[0].message.content
    itinerary = _parse_response(raw_content)

    # Enrich with lat/lng using Google Geocoding
    itinerary = enhance_itinerary_with_geocoding(itinerary)
    return itinerary
