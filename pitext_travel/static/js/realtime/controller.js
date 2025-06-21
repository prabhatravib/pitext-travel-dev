// static/js/realtime/controller.js - Simplified Realtime Controller
// Refactored from realtime_controller.js to just coordinate components

class RealtimeController {
    constructor() {
        // Singleton pattern - prevent multiple instances
        if (RealtimeController.instance) {
            return RealtimeController.instance;
        }
        RealtimeController.instance = this;
        
        this.audioCapture = null;
        this.audioPlayer = null;
        this.stateMachine = null;
        this.wsClient = null;
        
        this.connected = false;
        this.ready = false;
        this.eventHandlers = {};
        
        console.log('RealtimeController instance created (singleton)');
    }
    
    async initialize() {
        try {
            // Create components if not already created
            if (!this.audioCapture) {
                this.audioCapture = new window.AudioCapture();
            }
            if (!this.audioPlayer) {
                this.audioPlayer = new window.AudioPlayer();
            }
            if (!this.wsClient) {
                this.wsClient = new window.WebSocketClient();
            }
            if (!this.stateMachine) {
                this.stateMachine = new window.VoiceStateMachine();
            }
            
            // Initialize audio components
            await this.audioCapture.initialize();
            await this.audioPlayer.initialize();
            
            // Set up component interactions
            this._setupComponents();
            
            this.ready = true;
            console.log('RealtimeController initialized successfully');
            
            return true;
            
        } catch (error) {
            console.error('Failed to initialize RealtimeController:', error);
            this._trigger('error', { error, critical: true });
            return false;
        }
    }
    
    async connect() {
        if (!this.ready) {
            await this.initialize();
        }
        
        try {
            // Connect WebSocket
            await this.wsClient.connect();
            
            // Start continuous audio capture
            this.audioCapture.start();
            this.audioCapture.setEnabled(true);  // Enable immediately
            
            this.connected = true;
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
        
        this.connected = false;
        this._trigger('disconnected');
    }
    
    _setupComponents() {
        // Delegate to separate setup module to keep this file smaller
        if (window.RealtimeSetup) {
            window.RealtimeSetup.setupAudioCapture(this);
            window.RealtimeSetup.setupAudioPlayer(this);
            window.RealtimeSetup.setupStateMachine(this);
            window.RealtimeSetup.setupWebSocket(this);
        } else {
            console.error('RealtimeSetup module not loaded');
        }
    }
    
    // Public methods
    
    /**
     * Get current state
     */
    getState() {
        return {
            ready: this.ready,
            connected: this.connected,
            stateMachine: this.stateMachine.getState(),
            audioCapture: this.audioCapture.isActive(),
            audioPlayer: this.audioPlayer.getPlaybackState()
        };
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
}

// Export for use in other modules
window.RealtimeController = RealtimeController;