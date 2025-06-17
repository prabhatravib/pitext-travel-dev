"""
pitext_travel.api.realtime.audio_handler
---------------------------------------

Handles microphone-stream PCM data for the Realtime pipeline.

⚠️  IMPORTANT – VAD REMOVED
    • No WebRTC-VAD or thresholding.
    • We stream *all* audio frames to OpenAI.
    • OpenAI’s Realtime API emits `input_audio_buffer.speech_started`
      and `input_audio_buffer.speech_stopped`, which the frontend
      listens for (see websocket_client.js).

Typical usage (simplified):

    handler = AudioHandler()

    await handler.run(
        pcm_stream=my_async_generator(),
        on_chunk=lambda b64: ws.emit("audio_data", {"audio": b64}),
        on_commit=lambda: ws.emit("commit_audio")
    )
"""
from __future__ import annotations

import asyncio
import base64
import logging
import time
from collections import deque
from typing import Awaitable, Callable, Deque

logger = logging.getLogger(__name__)

# Audio constants (match browser MediaRecorder / getUserMedia settings)
SAMPLE_RATE   = 24_000            # Hz – OpenAI accepts 24 kHz directly
CHANNELS      = 1
SAMPLE_WIDTH  = 2                 # 16-bit PCM → 2 bytes / sample

FRAME_MS      = 20                # 20 ms frames → 480 samples @ 24 kHz
FRAME_BYTES   = int(SAMPLE_RATE * FRAME_MS / 1000) * SAMPLE_WIDTH
COMMIT_EVERY  = 1.0               # seconds – how often to send `commit_audio`


class AudioHandler:
    """
    Buffer raw PCM from an async iterator, group into ~20-ms frames,
    base64-encode, and push to the provided `on_chunk` coroutine.
    """

    def __init__(self) -> None:
        self._buf: Deque[bytes]   = deque()
        self._last_commit: float  = time.monotonic()

    # ------------------------------------------------------------------ #
    # Public API                                                         #
    # ------------------------------------------------------------------ #
    async def run(
        self,
        pcm_stream:       asyncio.AsyncIterator[bytes],
        on_chunk:         Callable[[str], Awaitable[None]],
        on_commit:        Callable[[],     Awaitable[None]],
    ) -> None:
        """
        Parameters
        ----------
        pcm_stream
            Async iterator yielding raw PCM16 mono chunks (any size).
        on_chunk(b64)
            Coroutine that forwards a **base64-encoded** PCM chunk
            to the Realtime websocket (`audio_data` event).
        on_commit()
            Coroutine that emits a `commit_audio` event telling
            OpenAI to begin/continue transcription.
        """
        async for chunk in pcm_stream:
            if not chunk:
                continue
            self._buf.append(chunk)
            await self._maybe_flush(on_chunk)

            if time.monotonic() - self._last_commit >= COMMIT_EVERY:
                await on_commit()
                self._last_commit = time.monotonic()

        # stream ended – flush whatever’s left
        await self._flush(on_chunk)
        await on_commit()

    # ------------------------------------------------------------------ #
    # Internal helpers                                                   #
    # ------------------------------------------------------------------ #
    async def _maybe_flush(self, on_chunk: Callable[[str], Awaitable[None]]) -> None:
        """Emit exactly FRAME_BYTES when we have enough buffered."""
        total = sum(len(b) for b in self._buf)
        if total < FRAME_BYTES:
            return

        payload = bytearray()
        while self._buf and len(payload) < FRAME_BYTES:
            payload.extend(self._buf.popleft())

        await on_chunk(base64.b64encode(payload).decode("ascii"))

    async def _flush(self, on_chunk: Callable[[str], Awaitable[None]]) -> None:
        if not self._buf:
            return
        payload = b"".join(self._buf)
        self._buf.clear()
        await on_chunk(base64.b64encode(payload).decode("ascii"))
