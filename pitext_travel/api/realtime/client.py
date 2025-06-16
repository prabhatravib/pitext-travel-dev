# pitext_travel/api/realtime/client.py
"""OpenAI Realtime WebSocket client for voice conversations."""

import json
import asyncio
import websocket
import threading
import logging
from typing import Optional, Callable, Dict, Any
from queue import Queue, Empty
from tenacity import retry, stop_after_attempt, wait_exponential

from pitext_travel.api.config import get_openai_api_key, get_realtime_config

logger = logging.getLogger(__name__)


class RealtimeClient:
    """WebSocket client for OpenAI Realtime API."""
    
    REALTIME_API_URL = "wss://api.openai.com/v1/realtime"
    
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.api_key = get_openai_api_key()
        self.config = get_realtime_config()
        
        # WebSocket connection
        self.ws: Optional[websocket.WebSocketApp] = None
        self.ws_thread: Optional[threading.Thread] = None
        self.is_connected = False
        self.connection_lock = threading.Lock()
        
        # Message queues
        self.outgoing_queue = Queue()
        self.incoming_queue = Queue()
        
        # Event handlers
        self.on_transcript: Optional[Callable] = None
        self.on_audio_chunk: Optional[Callable] = None
        self.on_function_call: Optional[Callable] = None
        self.on_error: Optional[Callable] = None
        self.on_session_update: Optional[Callable] = None
        
        # State tracking
        self.conversation_id: Optional[str] = None
        self.current_item_id: Optional[str] = None
        self.is_model_speaking = False
        
    def connect(self) -> bool:
        """Establish WebSocket connection to OpenAI Realtime API."""
        with self.connection_lock:
            if self.is_connected:
                return True
            
            try:
                # Create WebSocket connection with authentication
                headers = {
                    "Authorization": f"Bearer {self.api_key}",
                    "OpenAI-Beta": "realtime=v1"
                }
                
                self.ws = websocket.WebSocketApp(
                    f"{self.REALTIME_API_URL}?model={self.config['model']}",
                    header=headers,
                    on_open=self._on_open,
                    on_message=self._on_message,
                    on_error=self._on_error,
                    on_close=self._on_close
                )
                
                # Start WebSocket in separate thread
                self.ws_thread = threading.Thread(
                    target=self.ws.run_forever,
                    daemon=True
                )
                self.ws_thread.start()
                
                # Wait for connection
                timeout = 5.0
                while timeout > 0 and not self.is_connected:
                    threading.Event().wait(0.1)
                    timeout -= 0.1
                
                return self.is_connected
                
            except Exception as e:
                logger.error(f"Failed to connect to Realtime API: {e}")
                return False
    
    def disconnect(self):
        """Close WebSocket connection."""
        with self.connection_lock:
            if self.ws:
                self.ws.close()
                self.is_connected = False
                
            if self.ws_thread and self.ws_thread.is_alive():
                self.ws_thread.join(timeout=2.0)
    
    def _send_event(self, event: Dict[str, Any]):
        """Send event to OpenAI Realtime API."""
        if self.is_connected and self.ws:
            try:
                self.ws.send(json.dumps(event))
                logger.debug(f"Sent event: {event['type']}")
            except Exception as e:
                logger.error(f"Failed to send event: {e}")
                if self.on_error:
                    self.on_error(f"Failed to send event: {e}")
# new signature — self + ws argument
    def _on_open(self, ws):
        """Handle WebSocket connection opened."""
        # 1) Tell OpenAI we’re starting a session
        self._send_event({
            "type": "session.create",
            "input_audio_format": {"type": "pcm16", "sample_rate": 24000},
            "output_audio_format": {"type": "wav"}
        })

        # 2) Mark “connected” so send_audio() will work
        logger.info(f"Realtime API connection established for session {self.session_id}")
        self.is_connected = True

        # 3) Push your instructions, tool definitions, temperature, etc.
        self.update_session(
            instructions=self.config["instructions"],
            temperature=self.config["temperature"]
        )
    
    def send_audio(self, audio_data: bytes):
        """Send audio data to OpenAI."""
        if not self.is_connected:
            logger.warning("Cannot send audio - not connected")
            return
        
        # OpenAI expects base64 encoded audio in events
        import base64
        audio_base64 = base64.b64encode(audio_data).decode('ascii')
        
        event = {
            "type": "input_audio_buffer.append",
            "audio": audio_base64
        }
        
        self._send_event(event)

    
# pitext_travel/api/realtime/client.py
    def commit_audio(self):
        """Freeze the current input buffer and ask the model to reply."""
        # 1) tell OpenAI we’re done collecting audio
        self._send_event({"type": "input_audio_buffer.commit"})
        # 2) immediately request a response
        self._send_event({"type": "response.create"})
    
    def clear_audio_buffer(self):
        """Clear the input audio buffer."""
        event = {"type": "input_audio_buffer.clear"}
        self._send_event(event)
    
    def send_text(self, text: str):
        """Send text input (for testing or fallback)."""
        event = {
            "type": "conversation.item.create",
            "item": {
                "type": "message",
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": text
                    }
                ]
            }
        }
        self._send_event(event)
        
        # Trigger response
        self._send_event({"type": "response.create"})
    
    def interrupt(self):
        """Interrupt the current response."""
        if self.is_model_speaking:
            event = {"type": "response.cancel"}
            self._send_event(event)
    def update_session(self, instructions: Optional[str] = None, 
                    functions: Optional[list] = None,
                    temperature: Optional[float] = None):
        """Update session configuration."""
        session_update = {"type": "session.update", "session": {}}
        
        if instructions:
            session_update["session"]["instructions"] = instructions
            
        if functions:
            # Functions are already in the correct format from function_handler
            session_update["session"]["tools"] = functions
            
        if temperature is not None:
            session_update["session"]["temperature"] = temperature
        
    # Always include model configuration
            session_update["session"]["voice"] = self.config["voice"]
            session_update["session"]["input_audio_format"] = {
                "type": self.config["audio_format"]["input"],          # "pcm16" by default
                "sample_rate": self.config["audio_format"]["sample_rate"]  # 24000 by default
            }
            # OpenAI TTS only needs the codec for output; keep it simple
            session_update["session"]["output_audio_format"] = {"type": "wav"}
            session_update["session"]["turn_detection"] = {
            "type": "server_vad",
            "threshold": self.config["vad_threshold"],
            "prefix_padding_ms": self.config["vad_prefix_ms"],
            "silence_duration_ms": self.config["vad_silence_ms"]
        }
        
        self._send_event(session_update)

 
    def _on_message(self, ws, message):
        """Handle incoming WebSocket messages."""
        try:
            event = json.loads(message)
            event_type = event.get("type")
            
            logger.debug(f"Received event: {event_type}")
# Debug log all events
            if event_type not in ["response.audio.delta", "response.audio_transcript.delta"]:
                logger.info(f"Realtime API event: {event_type} - {event.get('item_id', 'no-id')}")
                        
            # Route events to appropriate handlers
            if event_type == "session.created":
                self._handle_session_created(event)
                
            elif event_type == "session.updated":
                self._handle_session_updated(event)
                
            elif event_type == "conversation.item.created":
                self._handle_item_created(event)
                
            elif event_type == "response.audio_transcript.delta":
                self._handle_transcript_delta(event)
                
            elif event_type == "response.audio.delta":
                self._handle_audio_delta(event)
                
            elif event_type == "response.function_call_arguments.done":
                self._handle_function_call(event)
                
            elif event_type == "response.created":
                self.is_model_speaking = True
                
            elif event_type in ["response.done", "response.cancelled"]:
                self.is_model_speaking = False
                
            elif event_type == "error":
                self._handle_error(event)
                
            # Store all events for debugging
            self.incoming_queue.put(event)
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse message: {e}")
        except Exception as e:
            logger.error(f"Error handling message: {e}")
    
    def _on_error(self, ws, error):
        """Handle WebSocket errors."""
        logger.error(f"WebSocket error: {error}")
        if self.on_error:
            self.on_error(str(error))
    
    def _on_close(self, ws, close_status_code, close_msg):
        """Handle WebSocket connection closed."""
        logger.info(f"Realtime API connection closed: {close_status_code} - {close_msg}")
        self.is_connected = False
    
    def _handle_session_created(self, event):
        """Handle session creation confirmation."""
        session = event.get("session", {})
        self.conversation_id = session.get("id")
        logger.info(f"Session created with ID: {self.conversation_id}")
        
        if self.on_session_update:
            self.on_session_update(session)
    
    def _handle_session_updated(self, event):
        """Handle session update confirmation."""
        session = event.get("session", {})
        if self.on_session_update:
            self.on_session_update(session)
    
    def _handle_item_created(self, event):
        """Handle new conversation item."""
        item = event.get("item", {})
        self.current_item_id = item.get("id")
    
    def _handle_transcript_delta(self, event):
        """Handle incremental transcript updates."""
        delta = event.get("delta", "")
        item_id = event.get("item_id")
        
        if self.on_transcript:
            self.on_transcript(delta, item_id, is_final=False)
    
    def _handle_audio_delta(self, event):
        """Handle audio data chunks."""
        audio_base64 = event.get("delta", "")
        item_id = event.get("item_id")
        
        if audio_base64 and self.on_audio_chunk:
            # Decode base64 audio
            import base64
            audio_data = base64.b64decode(audio_base64)
            self.on_audio_chunk(audio_data, item_id)
    
    def _handle_function_call(self, event):
        """Handle function call completion."""
        call_id = event.get("call_id")
        name = event.get("name")
        arguments = event.get("arguments", "{}")
        
        if self.on_function_call:
            try:
                args = json.loads(arguments)
                self.on_function_call(call_id, name, args)
            except json.JSONDecodeError:
                logger.error(f"Failed to parse function arguments: {arguments}")
    
    def _handle_error(self, event):
        """Handle error events."""
        error = event.get("error", {})
        message = error.get("message", "Unknown error")
        code = error.get("code")
        
        error_msg = f"Realtime API error: {code} - {message}" if code else message
        logger.error(error_msg)
        
        if self.on_error:
            self.on_error(error_msg)
    
    def send_function_result(self, call_id: str, result: Any):
        """Send function execution result back to the API."""
        event = {
            "type": "conversation.item.create",
            "item": {
                "type": "function_call_output",
                "call_id": call_id,
                "output": json.dumps(result) if not isinstance(result, str) else result
            }
        }
        self._send_event(event)
        
        # Trigger response generation
        self._send_event({"type": "response.create"})