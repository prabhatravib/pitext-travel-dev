// static/js/realtime/websocket_client.js - Simplified WebSocket Client
// Updated to use separate connection module for cleaner architecture

class WebSocketClient {
    constructor() {
        this.connection = new window.WebSocketConnection('/travel/ws');
        this.sessionId = null;
        
        // Event handlers
        this.eventHandlers = {};
        
        console.log('WebSocketClient initialized');
    }
    
    connect() {
        return this.connection.connect().then(() => {
            this._setupEventHandlers();
            return true;
        });
    }
    
    disconnect() {
        this.connection.disconnect();
        this.sessionId = null;
    }
    
    emit(event, data) {
        return this.connection.emit(event, data);
    }
    
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
    
    _setupEventHandlers() {
        // Delegate to separate event setup module
        if (window.WebSocketEventSetup) {
            window.WebSocketEventSetup.setupEvents(this.connection, this);
        } else {
            console.error('WebSocketEventSetup module not loaded');
        }
    }
    
    _triggerHandlers(event, data) {
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
    
    // WebSocket API methods
    
    startSession() {
        console.log('Starting Realtime session...');
        return this.emit('start_session', {});
    }

    sendAudioData(audioData) {
        if (!audioData || audioData.length === 0) return false;
        return this.emit('audio_data', { audio: audioData });
    }

    commitAudio() {
        console.log('[WebSocketClient] Committing audio buffer...');
        return this.emit('commit_audio', {});
    }
    
    clearAudio() {
        return this.emit('clear_audio', {});
    }
    
    interrupt() {
        console.log('Sending interrupt signal...');
        return this.emit('interrupt', {});
    }
    
    getStats() {
        return this.emit('get_stats', {});
    }
    
    // Status methods
    
    isConnected() {
        return this.connection.isConnected();
    }
    
    getSessionId() {
        return this.sessionId;
    }
    
    getConnectionState() {
        return {
            ...this.connection.getConnectionState(),
            sessionId: this.sessionId
        };
    }
}

// Export for use in other modules
window.WebSocketClient = WebSocketClient;