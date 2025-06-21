# Voice Activity Detection (VAD) Configuration

## Problem
The voice interface was taking too long to respond because the VAD silence duration was set too low (500-1000ms), causing the system to wait for manual user intervention rather than automatically detecting when the user finished speaking.

## Solution
Updated the VAD configuration to wait for 30 seconds of silence before processing the user's request.

## Changes Made

### 1. Updated `pitext_travel/api/config.py`

**TurnDetection Configuration:**
```python
turn_cfg = TurnDetection(
    type="server_vad",
    threshold=0.5,
    prefix_padding_ms=300,
    silence_duration_ms=30000,  # 30 seconds of silence (was 1000ms)
    create_response=True,
    interrupt_response=True,
)
```

**Realtime Configuration:**
```python
"vad_silence_ms": int(os.getenv("REALTIME_VAD_SILENCE_MS", "30000")),  # 30 seconds of silence
```

### 2. Environment Variable
To customize this setting, add to your `.env` file:
```
REALTIME_VAD_SILENCE_MS=30000
```

## How It Works

1. **Speech Detection**: OpenAI's server-side VAD detects when the user starts speaking
2. **Silence Monitoring**: After speech stops, the system waits for 30 seconds of continuous silence
3. **Auto-Processing**: Once 30 seconds of silence is detected, the system automatically processes the user's request
4. **Response Generation**: The AI generates and speaks the response

## Benefits

- **Faster Response**: No need to manually stop recording
- **Natural Interaction**: More conversational experience
- **Reduced User Friction**: Users can speak naturally without worrying about timing
- **Automatic Processing**: System handles the timing automatically

## Configuration Options

- **REALTIME_VAD_SILENCE_MS**: Duration of silence before processing (default: 30000ms = 30 seconds)
- **REALTIME_VAD_THRESHOLD**: Sensitivity of speech detection (default: 0.5)
- **REALTIME_VAD_PREFIX_MS**: Audio padding before speech (default: 300ms)

## Testing

After deployment, test the voice interface by:
1. Starting a voice session
2. Speaking your request (e.g., "Plan a trip to Paris for 3 days")
3. Stopping speaking and waiting
4. The system should automatically process your request after 30 seconds of silence 