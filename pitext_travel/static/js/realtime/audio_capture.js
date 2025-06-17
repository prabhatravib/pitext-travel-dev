/* ---------------------------------------------------------------------
   static/js/realtime/audio_capture.js
   Voice-uplink: microphone → VAD → down-sample (if needed) → PCM16 bytes
--------------------------------------------------------------------- */

// Target codec settings (must match the Realtime-API session)
const TARGET_SAMPLE_RATE = 24_000;
const TARGET_CHANNELS    = 1;

// Naïve but effective linear down-sampler (box filter)
function downsampleTo24kHz(float32, inRate) {
  if (inRate === TARGET_SAMPLE_RATE) return float32;               // nothing to do
  const ratio   = inRate / TARGET_SAMPLE_RATE;
  const outLen  = Math.floor(float32.length / ratio);
  const out     = new Float32Array(outLen);
  let  readIdx  = 0;
  for (let i = 0; i < outLen; i++) {
    const next = Math.floor((i + 1) * ratio);
    let   sum = 0;
    let   cnt = 0;
    while (readIdx < next) { sum += float32[readIdx++]; cnt++; }
    out[i] = sum / cnt;                                           // box-filter average
  }
  return out;
}

// ---------------------------------------------------------------------
// Audio capture with VAD integration
// ---------------------------------------------------------------------
class AudioCapture {
  constructor() {
    this.stream        = null;
    this.audioContext  = null;
    this.processorNode = null;
    this.vadProcessor  = null;
    this.active        = false;

    // Callbacks supplied by caller
    this.onAudioData   = null;  // (Int16Array pcm) => void
    this.onSpeechStart = null;  // (evt) => void
    this.onSpeechEnd   = null;  // (evt) => void

    console.log('[AudioCapture] ctor');
  }

  /* Convert Float32 [-1,1] → Int16 (-32768..32767) */
  _float32ToPCM16(float32) {
    const pcm = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      pcm[i]  = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return pcm;
  }

  /* Public helpers --------------------------------------------------- */
  isActive() { return this.active; }
  getVADState() { return this.vadProcessor ? this.vadProcessor.getState() : null; }
  updateVADParams(p) { if (this.vadProcessor) this.vadProcessor.updateParams(p); }

  /* Initialise mic + VAD -------------------------------------------- */
  async initialize() {
    try {
      /* 1️⃣  Ask for a mono mic stream, hinting 24 kHz. */
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate:   TARGET_SAMPLE_RATE,
          channelCount: TARGET_CHANNELS,
          echoCancellation:   true,
          noiseSuppression:   true,
          autoGainControl:    true
        }
      });

      /* 2️⃣  Create (or reuse) an AudioContext; request 24 kHz. */
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: TARGET_SAMPLE_RATE
      });

      // Some browsers ignore the request — log for debugging.
      console.log('[AudioCapture] AudioContext @', this.audioContext.sampleRate, 'Hz');
      if (this.audioContext.sampleRate !== TARGET_SAMPLE_RATE) {
        console.warn('[AudioCapture] Browser delivered a different rate; will down-sample.');
      }

      /* 3️⃣  Set up VAD (web-worker / worklet you already include). */
      this.vadProcessor = new window.VADProcessor({
        sampleRate: TARGET_SAMPLE_RATE,
        onSpeechStart: (e) => this.onSpeechStart && this.onSpeechStart(e),
        onSpeechEnd:   (e) => this.onSpeechEnd   && this.onSpeechEnd(e)
      });

      console.log('[AudioCapture] init OK');
      return true;

    } catch (err) {
      console.error('[AudioCapture] init failed:', err);
      throw err;
    }
  }

  /* Start streaming mic frames -------------------------------------- */
  start() {
    if (this.active || !this.stream) return;

    const sourceNode = this.audioContext.createMediaStreamSource(this.stream);

    // Older browsers: ScriptProcessor; modern: AudioWorklet. ScriptProcessor
    // is fine for a quick fix.
    const BUFFER_SIZE = 2048;
    this.processorNode = this.audioContext.createScriptProcessor(
      BUFFER_SIZE,
      TARGET_CHANNELS,
      TARGET_CHANNELS
    );

    this.processorNode.onaudioprocess = (event) => {
      const inputFloat = event.inputBuffer.getChannelData(0);

      // VAD → decide if we're speaking
      const vadResult = this.vadProcessor.processAudio(inputFloat);

      if (vadResult.isSpeaking) {
        // Down-sample if necessary
        const float24 = downsampleTo24kHz(inputFloat, this.audioContext.sampleRate);

        // Convert to PCM16
        const pcm16   = this._float32ToPCM16(float24);

        // Ship it
        if (this.onAudioData) this.onAudioData(pcm16);
      }
    };

    sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.audioContext.destination); // required by ScriptProcessor

    this.active = true;
    console.log('[AudioCapture] capture STARTED');
  }

  /* Stop mic capture ------------------------------------------------- */
  stop() {
    if (!this.active) return;

    if (this.processorNode) {
      try { this.processorNode.disconnect(); } catch (_) {}
      this.processorNode = null;
    }
    this.active = false;
    console.log('[AudioCapture] capture STOPPED');
  }

  /* Cleanup everything ---------------------------------------------- */
  cleanup() {
    this.stop();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
    this.audioContext = null;
    this.stream       = null;
    console.log('[AudioCapture] cleaned up');
  }
}

/* Expose to window for other modules */
window.AudioCapture = AudioCapture;
