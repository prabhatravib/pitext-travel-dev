// static/js/realtime/realtime_controller.js
// -------------------------------------------------------------
// Main orchestrator: wires up VAD, state-machine and WebSocket
// -------------------------------------------------------------

// ─── Module imports ───────────────────────────────────────────
import { AudioCapture }       from './audio_capture.js';
import { AudioPlayer }        from './audio_player.js';
import { WebSocketClient }    from './websocket_client.js';
import { VoiceStateMachine }  from './voice_state_machine.js';

// ─── Class definition ─────────────────────────────────────────
class RealtimeController {
  /*-----------------------------------------------------------
   * LIFE-CYCLE
   *----------------------------------------------------------*/
  constructor() {
    // Core components
    this.audioCapture  = new AudioCapture();
    this.audioPlayer   = new AudioPlayer();
    this.wsClient      = new WebSocketClient();
    this.stateMachine  = new VoiceStateMachine();

    // Status flags
    this.isInitialized = false;
    this.isConnected   = false;

    // Event listeners
    this.eventHandlers = {};

    console.log('[RTC] controller constructed');
  }

  /*-----------------------------------------------------------
   * INITIALISATION / CONNECTION
   *----------------------------------------------------------*/
  async initialize() {
    try {
      await this.audioCapture.initialize();
      await this.audioPlayer.initialize();

      this._setupAudioCapture();
      this._setupAudioPlayer();
      this._setupStateMachine();
      this._setupWebSocket();

      this.isInitialized = true;
      console.log('[RTC] initialised OK');
      return true;
    } catch (err) {
      console.error('[RTC] init failed:', err);
      this._trigger('error', { error: err, critical: true });
      return false;
    }
  }

  async connect() {
    if (!this.isInitialized) await this.initialize();

    try {
      await this.wsClient.connect(); // open Socket.IO
      this.audioCapture.start();     // start microphone + VAD
      this.wsClient.startSession();  // request OpenAI session

      this.isConnected = true;
      this._trigger('connected');
      return true;
    } catch (err) {
      console.error('[RTC] connect failed:', err);
      this._trigger('error', { error: err });
      return false;
    }
  }

  disconnect() {
    this.audioCapture.stop();
    this.audioPlayer.stop();
    this.wsClient.disconnect();
    this.stateMachine.reset();

    this.isConnected = false;
    this._trigger('disconnected');
  }

  /*-----------------------------------------------------------
   * SET-UP HELPERS
   *----------------------------------------------------------*/
  _setupAudioCapture() {
    // raw PCM from VAD → WebSocket
    this.audioCapture.onAudioData = (buf) => {
      if (this.stateMachine.isInState('LISTENING')) {
        const b64 = this._arrayBufferToBase64(buf);
        this.wsClient.sendAudioData(b64);
      }
    };

    this.audioCapture.onSpeechStart = () => {
      if (this.audioPlayer.isActive()) {
        this.audioPlayer.handleBargeIn();
        this.wsClient.interrupt();
      }
      this.stateMachine.onSpeechDetected();
    };

    this.audioCapture.onSpeechEnd = () => {
      this.wsClient.commitAudio();
      this.stateMachine.onSpeechEnded();
    };
  }

  _setupAudioPlayer() {
    this.audioPlayer.onPlaybackStart = () =>
      this.stateMachine.onResponseStarted();

    this.audioPlayer.onPlaybackEnd = () =>
      this.stateMachine.onSpeechCompleted();

    this.audioPlayer.onBargeIn = (ev) => this._trigger('barge_in', ev);
  }

  _setupStateMachine() {
    this.stateMachine.onStateChange = (tr) =>
      this._trigger('state_change', tr);

    this.stateMachine.on('onEnterListening', () => this.wsClient.clearAudio());
    this.stateMachine.on('onEnterWaiting',   () => this._trigger('ready'));
  }

  _setupWebSocket() {
    this.wsClient.on('session_started', (d) => {
      this.stateMachine.forceState('WAITING');
      this._trigger('session_started', d);
    });

    this.wsClient.on('transcript',  (d) => this._trigger('transcript', d));
    this.wsClient.on('audio_chunk', (d) => {
      if (d.audio) this.audioPlayer.playAudioData(d.audio);
    });

    this.wsClient.on('error', (e) => {
      console.error('[WS] error:', e);
      this.stateMachine.onProcessingError(e);
      this._trigger('error', { error: e });
    });

    this.wsClient.on('render_itinerary', (d) =>
      this._trigger('render_itinerary', d));
  }

  /*-----------------------------------------------------------
   * PUBLIC API
   *----------------------------------------------------------*/
  getState() {
    return {
      initialized : this.isInitialized,
      connected   : this.isConnected,
      vadState    : this.audioCapture.getVADState(),
      playerState : this.audioPlayer.getPlaybackState(),
      smState     : this.stateMachine.getState()
    };
  }

  updateVADParams(params) {
    this.audioCapture.updateVADParams(params);
  }

  // Event system
  on(event, fn) {
    (this.eventHandlers[event] ??= []).push(fn);
  }
  off(event, fn) {
    if (this.eventHandlers[event])
      this.eventHandlers[event] =
        this.eventHandlers[event].filter((h) => h !== fn);
  }

  /*-----------------------------------------------------------
   * INTERNAL UTILS
   *----------------------------------------------------------*/
  _trigger(event, data) {
    (this.eventHandlers[event] || []).forEach((h) => {
      try { h(data); } catch (err) {
        console.error(`[RTC] handler error (${event}):`, err);
      }
    });
  }

  _arrayBufferToBase64(buf) {
    const bin = String.fromCharCode(...new Uint8Array(buf));
    return btoa(bin);
  }
}

// ─── Export ──────────────────────────────────────────────────
window.RealtimeController = RealtimeController;  // for legacy code
export { RealtimeController };                   // ES-module export
