"""LLM helper functions for PiText‑Travel.

Generates itineraries via OpenAI Chat Completions and augments them with
Google Maps coordinates.  This version removes the dependency on
``get_openai_model_name()`` to avoid the runtime import error reported
during deployment.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List

from openai import OpenAI

client = OpenAI()                         # picks up OPENAI_API_KEY automatically

from pitext_travel.api.config import get_openai_api_key
from pitext_travel.api.geocoding import enhance_itinerary_with_geocoding

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# OpenAI client initialisation
# ---------------------------------------------------------------------------

# Allow overriding the chat model from the environment; fall back to a safe
# default so that the service can still start without extra configuration.
CHAT_MODEL_NAME = os.getenv("OPENAI_CHAT_MODEL", "gpt-4.1")

# ---------------------------------------------------------------------------
# Prompt construction helpers
# ---------------------------------------------------------------------------

def _build_prompt(city: str, days: int) -> str:
    return (
        "You are a helpful travel planner. "
        f"Create a {days}-day itinerary for {city}. "
        "Reply in strict JSON with the schema: "
        "{\n  \"days\": [\n    {\n      \"day\": <int>, \"stops\": [\n        {\n          \"name\": <str>, \"address\": <str|null>, \"lat\": null, \"lng\": null\n        }\n      ]\n    }\n  ]\n}"
    )


def _parse_response(content: str) -> List[Dict[str, Any]]:
    """Extract the itinerary list from the model's raw JSON string."""
    try:
        payload = json.loads(content)
        return payload["days"]
    except (json.JSONDecodeError, KeyError) as exc:
        logger.error("Failed to parse LLM response: %s", exc)
        raise


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_trip_itinerary(city: str, days: int) -> List[Dict[str, Any]]:
    """Return a list-of‑days itinerary enriched with geocoding data."""

    messages = [
        {"role": "system", "content": "You are ChatGPT."},
        {"role": "user", "content": _build_prompt(city, days)},
    ]

    logger.debug(
        "Calling OpenAI ChatCompletion: model=%s city=%s days=%d",
        'gpt-4.1',
        city,
        days,
    )

    response = client.chat.completions.create(
        model='gpt-4.1',
        messages=messages,
        temperature=0.2,
        max_tokens=2048,
    )

    raw_content: str = response.choices[0].message.content
    itinerary = _parse_response(raw_content)

    return enhance_itinerary_with_geocoding(itinerary)
