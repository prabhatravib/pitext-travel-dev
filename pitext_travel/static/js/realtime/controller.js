// static/js/realtime/controller.js - Simplified Realtime Controller
// Refactored from realtime_controller.js to just coordinate components

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
            this._setupComponents();
            
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
            
            // Start continuous audio capture
            this.audioCapture.start();
            this.audioCapture.setEnabled(true);  // Enable immediately
            
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
            initialized: this.isInitialized,
            connected: this.isConnected,
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