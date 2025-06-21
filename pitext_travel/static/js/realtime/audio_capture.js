/* ---------------------------------------------------------------------
   static/js/realtime/audio_capture.js
   Voice-uplink: microphone → down-sample → PCM16 bytes with filtering
--------------------------------------------------------------------- */

// Target codec settings
const TARGET_SAMPLE_RATE = 24_000;
const TARGET_CHANNELS    = 1;

// Audio filtering to reduce feedback
const SILENCE_THRESHOLD = 0.005;  // Minimum energy to consider as speech
const MIN_AUDIO_LENGTH = 256;   // Reduced from 512 for faster response

function downsampleTo24kHz(float32, inRate) {
  if (inRate === TARGET_SAMPLE_RATE) return float32;
  const ratio   = inRate / TARGET_SAMPLE_RATE;
  const outLen  = Math.floor(float32.length / ratio);
  const out     = new Float32Array(outLen);
  let  readIdx  = 0;
  for (let i = 0; i < outLen; i++) {
    const next = Math.floor((i + 1) * ratio);
    let   sum = 0;
    let   cnt = 0;
    while (readIdx < next) { sum += float32[readIdx++]; cnt++; }
    out[i] = sum / cnt;
  }
  return out;
}

class AudioCapture {
  constructor() {
    this.stream        = null;
    this.audioContext  = null;
    this.processorNode = null;
    this.active        = false;
    this.isEnabled     = false;  // NEW: Control when to actually send audio

    // Audio filtering
    this.audioBuffer   = [];
    this.bufferSize    = 0;
    this.lastSentTime  = 0;
    this.sendInterval  = 50; // Increased from 25ms to 50ms for stability

    this.onAudioData   = null;

    console.log('[AudioCapture] ctor - with audio filtering');
  }

  /* Calculate RMS energy of audio frame */
  _calculateRMS(float32) {
    let sum = 0;
    for (let i = 0; i < float32.length; i++) {
      sum += float32[i] * float32[i];
    }
    return Math.sqrt(sum / float32.length);
  }

  /* Check if audio contains speech */
  _containsSpeech(float32) {
    const energy = this._calculateRMS(float32);
    return energy > SILENCE_THRESHOLD;
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

  isActive() { return this.active; }
  
  /* Enable/disable audio sending */
  setEnabled(enabled) {
    this.isEnabled = enabled;
    if (!enabled) {
      this.audioBuffer = [];
      this.bufferSize = 0;
    }
    console.log('[AudioCapture] Audio sending', enabled ? 'ENABLED' : 'DISABLED');
  }

  async initialize() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate:   TARGET_SAMPLE_RATE,
          channelCount: TARGET_CHANNELS,
          echoCancellation:   true,
          noiseSuppression:   true,
          autoGainControl:    true
        }
      });

      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: TARGET_SAMPLE_RATE
      });

      console.log('[AudioCapture] AudioContext @', this.audioContext.sampleRate, 'Hz');
      return true;

    } catch (err) {
      console.error('[AudioCapture] init failed:', err);
      throw err;
    }
  }

  start() {
    if (this.active || !this.stream) return;

    const sourceNode = this.audioContext.createMediaStreamSource(this.stream);
    const BUFFER_SIZE = 1024;
    this.processorNode = this.audioContext.createScriptProcessor(
      BUFFER_SIZE,
      TARGET_CHANNELS,
      TARGET_CHANNELS
    );

    this.processorNode.onaudioprocess = (event) => {
      if (!this.isEnabled) return; // Don't process if disabled

      const inputFloat = event.inputBuffer.getChannelData(0);
      
      // Down-sample if necessary
      const float24 = downsampleTo24kHz(inputFloat, this.audioContext.sampleRate);
      
      // Add to buffer
      this.audioBuffer.push(...float24);
      this.bufferSize += float24.length;

      // Send buffered audio periodically
      const now = Date.now();
      if (now - this.lastSentTime > this.sendInterval && this.bufferSize >= MIN_AUDIO_LENGTH) {
        this._sendBufferedAudio();
        this.lastSentTime = now;
      }
    };

    sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.audioContext.destination);

    this.active = true;
    console.log('[AudioCapture] capture STARTED with filtering');
  }

  _sendBufferedAudio() {
    if (this.audioBuffer.length === 0 || !this.onAudioData) return;

    const float32Array = new Float32Array(this.audioBuffer);
    const pcm16 = this._float32ToPCM16(float32Array);
    
    // Clear buffer
    this.audioBuffer = [];
    this.bufferSize = 0;

    // Send to backend
    this.onAudioData(pcm16);
  }

  stop() {
    if (!this.active) return;

    // Send any remaining buffered audio
    if (this.audioBuffer.length > 0) {
      this._sendBufferedAudio();
    }

    if (this.processorNode) {
      try { this.processorNode.disconnect(); } catch (_) {}
      this.processorNode = null;
    }
    this.active = false;
    this.isEnabled = false;
    console.log('[AudioCapture] capture STOPPED');
  }

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

window.AudioCapture = AudioCapture;