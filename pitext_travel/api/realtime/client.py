"""OpenAI Realtime WebSocket client with built-in VAD event handling."""

from __future__ import annotations

import base64
import json
import logging
import ssl
import threading
from queue import Queue
from typing import Any, Callable, Dict, Optional

import websocket
from tenacity import retry, stop_after_attempt, wait_exponential

from pitext_travel.api.config import get_openai_api_key, get_realtime_config

logger = logging.getLogger(__name__)


class RealtimeClient:
    """Thin wrapper around the OpenAI Realtime WebSocket API.
    
    Handles OpenAI's server-side VAD events.
    """

    REALTIME_API_URL = "wss://api.openai.com/v1/realtime"

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.api_key = get_openai_api_key()
        self.config = get_realtime_config()

        # WebSocket state
        self._ws_app: Optional[websocket.WebSocketApp] = None
        self._thread: Optional[threading.Thread] = None
        self.is_connected: bool = False
        self._lock = threading.Lock()

        # Queues for debugging / tracing
        self.outgoing_queue: Queue = Queue()
        self.incoming_queue: Queue = Queue()

        # Callback hooks
        self.on_transcript: Optional[Callable] = None
        self.on_audio_chunk: Optional[Callable] = None
        self.on_function_call: Optional[Callable] = None
        self.on_error: Optional[Callable] = None
        self.on_session_update: Optional[Callable] = None
        
        # OpenAI VAD event callbacks - NEW
        self.on_speech_started: Optional[Callable] = None
        self.on_speech_stopped: Optional[Callable] = None
        self.on_response_started: Optional[Callable] = None
        self.on_response_done: Optional[Callable] = None

        # Conversation tracking
        self.conversation_id: Optional[str] = None
        self.current_item_id: Optional[str] = None
        self.is_model_speaking: bool = False

    def connect(self) -> bool:
        """Open the WebSocket in a background thread."""
        with self._lock:
            if self.is_connected:
                return True

            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "OpenAI-Beta": "realtime=v1",
            }

            self._ws_app = websocket.WebSocketApp(
                f"{self.REALTIME_API_URL}?model={self.config['model']}",
                header=headers,
                on_open=self._on_open,
                on_message=self._on_message,
                on_error=self._on_error,
                on_close=self._on_close,
            )

            self._thread = threading.Thread(
                target=self._ws_app.run_forever,
                kwargs={
                    "ping_interval": 20,
                    "ping_timeout": 10,
                    "sslopt": {
                        "cert_reqs": ssl.CERT_REQUIRED,
                        "ca_certs": ssl.get_default_verify_paths().cafile
                    }
                },
                daemon=True,
            )
            self._thread.start()

            # Wait for connection
            timeout = 50
            while timeout > 0 and not self.is_connected:
                threading.Event().wait(0.1)
                timeout -= 1

            if not self.is_connected:
                logger.error("Realtime API: connection timed out")
            return self.is_connected

    def disconnect(self):
        """Close the socket and join the worker thread."""
        with self._lock:
            if self._ws_app:
                try:
                    self._ws_app.close()
                except Exception:
                    pass
                self._ws_app = None
                self.is_connected = False

            if self._thread and self._thread.is_alive():
                self._thread.join(timeout=2.0)
                self._thread = None

    def _send_event(self, event: Dict[str, Any]):
        """Serialize event to JSON and push through the socket."""
        if not self.is_connected or not self._ws_app:
            logger.warning("Tried to send while not connected: %s", event.get("type"))
            return
        try:
            payload = json.dumps(event)
            self._ws_app.send(payload)
            self.outgoing_queue.put(event)
            logger.debug("▶ %s", event["type"])
        except Exception as exc:
            logger.error("Failed to send %s: %s", event.get("type"), exc)
            if self.on_error:
                self.on_error(str(exc))

    def _on_open(self, ws):
        """Initial handshake once the TCP tunnel is up."""
        logger.info("Realtime API connection established for session %s", self.session_id)
        self.is_connected = True

        # Create session with server-side VAD
        self.update_session(
            input_audio_format="pcm16",
            output_audio_format="pcm16",
            instructions=self.config["instructions"],
            temperature=self.config["temperature"],
            turn_detection={
                "type": "server_vad",  # Use OpenAI's VAD
                "threshold": self.config["vad_threshold"],
                "prefix_padding_ms": self.config["vad_prefix_ms"],
                "silence_duration_ms": self.config["vad_silence_ms"],
                "create_response": True,
                "interrupt_response": True,
            }
        )

    def _on_message(self, ws, message):
        """Decode JSON and route to the appropriate handler."""
        try:
            event = json.loads(message)
        except json.JSONDecodeError:
            logger.error("Malformed message: %s", message[:120])
            return

        etype = event.get("type")
        if etype not in {"response.audio.delta", "response.audio_transcript.delta"}:
            logger.info("◀ %s", etype)
        self.incoming_queue.put(event)

        match etype:
            # Session events
            case "session.created":
                self._handle_session_created(event)
            case "session.updated":
                self._handle_session_updated(event)
                
            # OpenAI VAD events - NEW
            case "input_audio_buffer.speech_started":
                self._handle_speech_started(event)
            case "input_audio_buffer.speech_stopped":
                self._handle_speech_stopped(event)
                
            # Conversation events
            case "conversation.item.created":
                self._handle_item_created(event)
                
            # Response events
            case "response.created":
                self._handle_response_created(event)
            case "response.done":
                self._handle_response_done(event)
            case "response.cancelled":
                self._handle_response_cancelled(event)
                
            # Audio/transcript events
            case "response.audio_transcript.delta":
                self._handle_transcript_delta(event)
            case "response.audio.delta":
                self._handle_audio_delta(event)
                
            # Function call events
            case "response.function_call_arguments.done":
                self._handle_function_call(event)
                
            # Error events
            case "error":
                self._handle_error(event)
                
            case _:
                pass  # ignore other events

    def _on_error(self, ws, error):
        logger.error("WebSocket error: %s", error)
        if self.on_error:
            self.on_error(str(error))

    def _on_close(self, ws, code, reason):
        logger.info("Realtime API connection closed: %s – %s", code, reason)
        self.is_connected = False

    # OpenAI VAD event handlers - NEW
    def _handle_speech_started(self, event):
        """Handle when OpenAI detects speech has started."""
        logger.info("OpenAI VAD: Speech started")
        if self.on_speech_started:
            self.on_speech_started(event)

    def _handle_speech_stopped(self, event):
        """Handle when OpenAI detects speech has stopped."""
        logger.info("OpenAI VAD: Speech stopped")
        if self.on_speech_stopped:
            self.on_speech_stopped(event)

    def _handle_response_created(self, event):
        """Handle when response generation starts."""
        self.is_model_speaking = True
        if self.on_response_started:
            self.on_response_started(event)

    def _handle_response_done(self, event):
        """Handle when response generation completes."""
        self.is_model_speaking = False
        if self.on_response_done:
            self.on_response_done(event)

    def _handle_response_cancelled(self, event):
        """Handle when response is cancelled (e.g., user interruption)."""
        self.is_model_speaking = False
        logger.info("Response cancelled (user interruption)")
        if self.on_response_done:
            self.on_response_done(event)

    # Existing event handlers
    def _handle_session_created(self, event):
        self.conversation_id = event.get("session", {}).get("id")
        if self.on_session_update:
            self.on_session_update(event["session"])

    def _handle_session_updated(self, event):
        if self.on_session_update:
            self.on_session_update(event["session"])

    def _handle_item_created(self, event):
        self.current_item_id = event.get("item", {}).get("id")

    def _handle_transcript_delta(self, event):
        if self.on_transcript:
            self.on_transcript(event.get("delta", ""), event.get("item_id"), False)

    def _handle_audio_delta(self, event):
        if self.on_audio_chunk:
            audio_bytes = base64.b64decode(event.get("delta", ""))
            self.on_audio_chunk(audio_bytes, event.get("item_id"))

    def _handle_function_call(self, event):
        if self.on_function_call:
            try:
                args = json.loads(event.get("arguments", "{}"))
            except json.JSONDecodeError:
                args = {}
            self.on_function_call(event.get("call_id"), event.get("name"), args)

    def _handle_error(self, event):
        msg = event.get("error", {}).get("message", "Unknown error")
        logger.error("Realtime API error: %s", msg)
        if self.on_error:
            self.on_error(msg)

    # High-level send helpers
    def send_audio(self, audio_data: bytes):
        """Send audio data continuously (no VAD filtering)."""
        if not self.is_connected:
            return
        self._send_event(
            {
                "type": "input_audio_buffer.append",
                "audio": base64.b64encode(audio_data).decode("ascii"),
            }
        )

    def commit_audio(self):
        """Note: With server-side VAD, OpenAI handles this automatically."""
        self._send_event({"type": "input_audio_buffer.commit"})

    def clear_audio_buffer(self):
        self._send_event({"type": "input_audio_buffer.clear"})

    def send_text(self, text: str):
        self._send_event(
            {
                "type": "conversation.item.create",
                "item": {
                    "type": "message",
                    "role": "user",
                    "content": [{"type": "input_text", "text": text}],
                },
            }
        )
        self._send_event({"type": "response.create"})

    def interrupt(self):
        """Cancel the current response."""
        if self.is_model_speaking:
            self._send_event({"type": "response.cancel"})

    def update_session(
        self,
        *,
        instructions: str | None = None,
        functions: list[dict] | None = None,
        temperature: float | None = None,
        voice: str | None = None,
        turn_detection: dict | None = None,
        **extra: Any,
    ) -> None:
        """Update session configuration."""
        patch: dict[str, Any] = {"type": "session.update", "session": {}}

        if instructions:
            patch["session"]["instructions"] = instructions
        if functions is not None:
            patch["session"]["tools"] = functions
        if temperature is not None:
            patch["session"]["temperature"] = temperature
        if voice:
            patch["session"]["voice"] = voice
        if turn_detection:
            patch["session"]["turn_detection"] = turn_detection

        # Audio format settings
        if "input_audio_format" in extra:
            patch["session"]["input_audio_format"] = extra["input_audio_format"]
        if "output_audio_format" in extra:
            patch["session"]["output_audio_format"] = extra["output_audio_format"]

        if extra:
            for k, v in extra.items():
                if k not in ["input_audio_format", "output_audio_format"]:
                    patch["session"][k] = v

        self._send_event(patch)
        logger.info(
            "Realtime session %s updated with keys: %s",
            self.session_id,
            ", ".join(patch["session"].keys()),
        )

    def send_function_result(self, call_id: str, result: Any):
        self._send_event(
            {
                "type": "conversation.item.create",
                "item": {
                    "type": "function_call_output",
                    "call_id": call_id,
                    "output": json.dumps(result) if not isinstance(result, str) else result,
                },
            }
        )
        self._send_event({"type": "response.create"})