# api/config.py
"""Configuration management for the travel planner API."""
import os
from dotenv import load_dotenv

load_dotenv()


def get_openai_api_key():
    """Get OpenAI API key from environment."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not set")
    return api_key


def get_google_maps_config():
    """Get Google Maps configuration."""
    return {
        "api_key": os.getenv("GOOGLE_MAPS_API_KEY", ""),
        "client_id": os.getenv("maps_client_id", ""),
        "client_secret": os.getenv("maps_client_secret", "")
    }


def get_port():
    """Get port configuration."""
    return int(os.getenv("PORT", 3000))


def get_render_mode():
    """Get render mode configuration."""
    return os.getenv("RENDER_MODE", "html")


# NEW: Realtime API Configuration
def get_realtime_config():
    """Get OpenAI Realtime API configuration."""
    return {
        # Model configuration
        "model": os.getenv("OPENAI_REALTIME_MODEL", "gpt-4o-realtime-preview-2024-12-17"),
        "voice": os.getenv("REALTIME_VOICE", "alloy"),
        "temperature": float(os.getenv("REALTIME_TEMPERATURE", "0.8")),
        
        # Response configuration
        "max_response_duration_ms": int(os.getenv("REALTIME_MAX_RESPONSE_DURATION_MS", "30000")),
        
        # Voice Activity Detection (VAD) configuration
        "vad_threshold": float(os.getenv("REALTIME_VAD_THRESHOLD", "0.5")),
        "vad_prefix_ms": int(os.getenv("REALTIME_VAD_PREFIX_MS", "300")),
        "vad_silence_ms": int(os.getenv("REALTIME_VAD_SILENCE_MS", "500")),
        
        # Session configuration
        "session_timeout_seconds": int(os.getenv("REALTIME_SESSION_TIMEOUT_SECONDS", "600")),
        "max_concurrent_sessions": int(os.getenv("MAX_CONCURRENT_REALTIME_SESSIONS", "50")),
        "rate_limit_per_ip": int(os.getenv("REALTIME_RATE_LIMIT_PER_IP", "10")),
        
        # Audio configuration
        "audio_format": {
            "input": os.getenv("AUDIO_INPUT_FORMAT", "pcm16"),
            "output": os.getenv("AUDIO_OUTPUT_FORMAT", "pcm16"),
            "sample_rate": int(os.getenv("AUDIO_SAMPLE_RATE", "24000"))
        },
        
        # Instructions for the assistant
        "instructions": """You are a friendly travel planning assistant helping users plan their trips through natural voice conversation. 
        
Your capabilities:
- Plan multi-day itineraries for any city
- Explain specific days or give overviews
- Suggest modifications to existing plans
- Answer questions about destinations

Important guidelines:
- Be conversational and natural, as this is a voice conversation
- Keep responses concise but informative
- When you need both city and days to plan a trip, ask naturally
- Use the plan_trip function when you have both parameters
- Use explain_day to describe existing itineraries
- Be enthusiastic about travel and destinations
- If interrupted, gracefully adapt to the new input"""
    }


def get_websocket_config():
    """Get WebSocket configuration."""
    return {
        "max_message_size": int(os.getenv("WEBSOCKET_MAX_MESSAGE_SIZE", "10485760")),  # 10MB
        "ping_interval": int(os.getenv("WEBSOCKET_PING_INTERVAL", "25")),
        "ping_timeout": int(os.getenv("WEBSOCKET_PING_TIMEOUT", "60")),
        "cors_allowed_origins": os.getenv("WEBSOCKET_CORS_ORIGINS", "*").split(",")
    }


def validate_realtime_config():
    """Validate Realtime API configuration is properly set."""
    api_key = get_openai_api_key()
    realtime_config = get_realtime_config()
    
    # Check if API key looks valid
    if not api_key.startswith("sk-"):
        raise ValueError("OpenAI API key appears invalid (should start with 'sk-')")
    
    # Validate voice options
    valid_voices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"]
    if realtime_config["voice"] not in valid_voices:
        raise ValueError(f"Invalid voice. Must be one of: {', '.join(valid_voices)}")
    
    # Validate audio format
    valid_formats = ["pcm16", "g711_ulaw", "g711_alaw"]
    if realtime_config["audio_format"]["input"] not in valid_formats:
        raise ValueError(f"Invalid input audio format. Must be one of: {', '.join(valid_formats)}")
    
    return True