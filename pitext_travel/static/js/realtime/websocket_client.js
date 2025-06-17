// static/js/realtime/websocket_client.js
// Improved WebSocket client – now forwards OpenAI’s server-side VAD events
// (`speech_started` / `speech_stopped`) to the rest of the app.

class WebSocketClient {
  constructor() {
    this.socket               = null;
    this.connected            = false;
    this.sessionId            = null;
    this.namespace            = '/travel/ws';

    this.reconnectAttempts    = 0;
    this.maxReconnectAttempts = 5;
    this.connectionTimeout    = 10_000;

    this.eventHandlers        = {};   // { eventName → [fn, …] }
    console.log('[WS] WebSocketClient created');
  }

  /* ------------------------------------------------------------------ */
  /*  Connection management                                             */
  /* ------------------------------------------------------------------ */
  connect() {
    return new Promise((resolve, reject) => {
      if (!window.io) return reject(new Error('Socket.IO not loaded'));

      const timeout = setTimeout(
        () => reject(new Error('WebSocket connection timeout')),
        this.connectionTimeout
      );

      this.socket = io(this.namespace, {
        transports:          ['websocket', 'polling'],
        path:                '/socket.io/',
        reconnection:        true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay:    1_000,
        reconnectionDelayMax: 5_000,
        timeout:              20_000,
        forceNew:             true
      });

      /* ---------- built-in events ---------- */
      this.socket.on('connect', () => {
        clearTimeout(timeout);
        this.connected         = true;
        this.reconnectAttempts = 0;
        console.log('[WS] connected');
        this._trigger('connected');
        resolve();
      });

      this.socket.on('connect_error', err => {
        clearTimeout(timeout);
        console.error('[WS] connect_error', err);
        this.connected = false;
        this.reconnectAttempts += 1;
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          reject(
            new Error(`Failed after ${this.maxReconnectAttempts} attempts`)
          );
        }
      });

      this.socket.on('disconnect', reason => {
        console.warn('[WS] disconnected:', reason);
        this.connected = false;
        this._trigger('disconnected', { reason });
      });

      /* ---------- application events ---------- */
      this._setupEventForwarding();
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket  = null;
      this.connected = false;
      this.sessionId = null;
      console.log('[WS] disconnected (manual)');
    }
  }

  /* ------------------------------------------------------------------ */
  /*  High-level emit helpers                                           */
  /* ------------------------------------------------------------------ */
  emit(evt, data = {}) {
    if (!this.socket || !this.connected) {
      console.error('[WS] emit while not connected:', evt);
      return false;
    }
    try {
      this.socket.emit(evt, data);
      return true;
    } catch (err) {
      console.error('[WS] emit failed:', err);
      return false;
    }
  }

  startSession()  { return this.emit('start_session'); }
  sendAudioData(b64) { return this.emit('audio_data', { audio: b64 }); }
  commitAudio()   { return this.emit('commit_audio'); }
  interrupt()     { return this.emit('interrupt'); }
  getStats()      { return this.emit('get_stats'); }

  /* ------------------------------------------------------------------ */
  /*  Event-handler registration                                        */
  /* ------------------------------------------------------------------ */
  on(evt, fn)  { (this.eventHandlers[evt] ??= []).push(fn); }
  off(evt, fn) { this.eventHandlers[evt] =
                   (this.eventHandlers[evt] || []).filter(f => f !== fn); }

  _trigger(evt, data) {
    (this.eventHandlers[evt] || []).forEach(fn => {
      try { fn(data); } catch (e) { console.error(`[WS] ${evt} handler`, e); }
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Forward server-side events from Socket.IO → internal bus          */
  /* ------------------------------------------------------------------ */
  _setupEventForwarding() {
    if (!this.socket) return;

    /* Session / diagnostics */
    this.socket.on('connected',        d => { this.sessionId = d.session_id;
                                              this._trigger('connected', d); });
    this.socket.on('session_started',  d => this._trigger('session_started', d));
    this.socket.on('session_update',   d => this._trigger('session_update',  d));

    /* Speech & audio */
    this.socket.on('transcript',       d => this._trigger('transcript',      d));
    this.socket.on('audio_chunk',      d => this._trigger('audio_chunk',     d));

    /* NEW – OpenAI server-side VAD events */
    this.socket.on('speech_started',   d => this._trigger('speech_started',  d));
    this.socket.on('speech_stopped',   d => this._trigger('speech_stopped',  d));

    /* Misc */
    this.socket.on('render_itinerary', d => this._trigger('render_itinerary',d));
    this.socket.on('interrupted',      d => this._trigger('interrupted',     d));
    this.socket.on('stats',            d => this._trigger('stats',           d));
    this.socket.on('error',            d => this._trigger('error',           d));
  }
}

/* expose */
window.WebSocketClient = WebSocketClient;
