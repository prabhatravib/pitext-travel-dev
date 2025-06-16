// static/js/realtime/realtime_controller.js
// Main controller that integrates VAD, state machine, and WebSocket communication

class RealtimeController {
    constructor() {
        // Core components
        this.audioCapture = new window.AudioCapture();
        this.audioPlayer = new window.AudioPlayer();
        this.wsClient = new window.WebSocketClient();
        this.stateMachine = new window.VoiceStateMachine();
        
        // State
        this.isInitialized = false;
        this.isConnected = false;
        
        // Event handlers for external listeners
        this.eventHandlers = {};
        
        console.log('RealtimeController initialized');
    }
    
    async initialize() {
        try {
            // Initialize audio components
            await this.audioCapture.initialize();
            await this.audioPlayer.initialize();
            
            // Set up component interactions
            this._setupAudioCapture();
            this._setupAudioPlayer();
            this._setupStateMachine();
            this._setupWebSocket();
            
            this.isInitialized = true;
            console.log('RealtimeController initialized successfully');
            
            return true;
            
        } catch (error) {
            console.error('Failed to initialize RealtimeController:', error);
            this._trigger('error', { error, critical: true });
            return false;
        }
    }
    
    async connect() {
        if (!this.isInitialized) {
            await this.initialize();
        }
        
        try {
            // Connect WebSocket
            await this.wsClient.connect();
            
            // Start audio capture with VAD
            this.audioCapture.start();
            
            this.isConnected = true;
            this._trigger('connected');
            
            // Start Realtime session
            this.wsClient.startSession();
            
            return true;
            
        } catch (error) {
            console.error('Failed to connect:', error);
            this._trigger('error', { error });
            return false;
        }
    }
    
    disconnect() {
        // Stop audio
        this.audioCapture.stop();
        this.audioPlayer.stop();
        
        // Disconnect WebSocket
        this.wsClient.disconnect();
        
        // Reset state machine
        this.stateMachine.reset();
        
        this.isConnected = false;
        this._trigger('disconnected');
    }
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
    // Handle playback start
    this.audioPlayer.onPlaybackStart = () => {
        console.log('[RealtimeController] TTS playback started');
        this.stateMachine.onResponseStarted();
        
        // Update UI to show assistant is speaking
        this._trigger('assistant_speaking', { speaking: true });
    };
    
    // Handle playback end
    this.audioPlayer.onPlaybackEnd = () => {
        console.log('[RealtimeController] TTS playback ended');
        this.stateMachine.onSpeechCompleted();
        
        // Update UI to show assistant stopped speaking
        this._trigger('assistant_speaking', { speaking: false });
    };
    
    // Handle errors
    this.audioPlayer.onError = (error) => {
        console.error('[RealtimeController] Audio playback error:', error);
        this._trigger('audio_error', { error });
    };
}  
    _setupStateMachine() {
        // State change notifications
        this.stateMachine.onStateChange = (transition) => {
            console.log(`State: ${transition.from} -> ${transition.to}`);
            this._trigger('state_change', transition);
        };
        
        // State handlers
        this.stateMachine.on('onEnterListening', () => {
            // Clear any previous audio
            this.wsClient.clearAudio();
        });
        
        this.stateMachine.on('onEnterProcessing', () => {
            // Audio has been committed, waiting for response
        });
        
        this.stateMachine.on('onEnterSpeaking', () => {
            // TTS is playing
        });
        
        this.stateMachine.on('onEnterWaiting', () => {
            // Ready for next interaction
            this._trigger('ready');
        });
    }
    
    _setupWebSocket() {
        // Handle connection events
        this.wsClient.on('session_started', (data) => {
            console.log('Realtime session started:', data);
            this._trigger('session_started', data);
            
            // Move to waiting state
            this.stateMachine.forceState('WAITING');
        });
        
        // Handle transcripts
        this.wsClient.on('transcript', (data) => {
            this._trigger('transcript', data);
        });
        
// Handle audio chunks from TTS
this.wsClient.on('audio_chunk', (data) => {
    if (data.audio) {
        console.log('[RealtimeController] Received audio chunk');
        
        // Play audio immediately
        this.audioPlayer.playAudioData(data.audio);
        
        // Update stats
        const audioSize = typeof data.audio === 'string' 
            ? Math.floor(data.audio.length * 0.75) // Base64 to bytes estimate
            : data.audio.byteLength;
        console.log('[RealtimeController] Audio chunk size:', audioSize);
    }
});        
        // Handle errors
        this.wsClient.on('error', (error) => {
            console.error('WebSocket error:', error);
            this.stateMachine.onProcessingError(error);
            this._trigger('error', { error });
        });
        
        // Handle custom events (like render_itinerary)
        this.wsClient.on('render_itinerary', (data) => {
            this._trigger('render_itinerary', data);
        });
    }
    
    // Public methods
    
    /**
     * Send text input (for testing or fallback)
     */
    sendText(text) {
        // Not implemented in this example - would bypass VAD
        console.log('Text input not implemented in VAD mode');
    }
    
    /**
     * Get current state
     */
    getState() {
        return {
            initialized: this.isInitialized,
            connected: this.isConnected,
            stateMachine: this.stateMachine.getState(),
            audioCapture: this.audioCapture.isActive(),
            audioPlayer: this.audioPlayer.getPlaybackState(),
            vadState: this.audioCapture.getVADState()
        };
    }
    
    /**
     * Update VAD parameters
     */
    updateVADParams(params) {
        this.audioCapture.updateVADParams(params);
    }
    
    // Event handling
    
    on(event, handler) {
        if (!this.eventHandlers[event]) {
            this.eventHandlers[event] = [];
        }
        this.eventHandlers[event].push(handler);
    }
    
    off(event, handler) {
        if (this.eventHandlers[event]) {
            this.eventHandlers[event] = this.eventHandlers[event].filter(
                h => h !== handler
            );
        }
    }
    
    _trigger(event, data) {
        const handlers = this.eventHandlers[event];
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Error in ${event} handler:`, error);
                }
            });
        }
    }
    
    // Utility methods
    
    _arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }
}

// Export for use in other modules
window.RealtimeController = RealtimeController;