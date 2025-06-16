// static/js/realtime/websocket_client.js
// Improved WebSocket client with better error handling and retry logic

class WebSocketClient {
    constructor() {
        this.socket = null;
        this.connected = false;
        this.sessionId = null;
        
        // Event handlers
        this.eventHandlers = {};
        
        // Connection settings
        this.namespace = '/travel/ws';
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.connectionTimeout = 10000; // 10 seconds
        
        console.log('WebSocketClient initialized');
    }
    
    connect() {
        return new Promise((resolve, reject) => {
            // Check if Socket.IO is available
            if (!window.io) {
                reject(new Error('Socket.IO client library not loaded'));
                return;
            }

            try {
                console.log(`Attempting to connect to ${this.namespace}...`);
                
                // Create connection with timeout
                const timeoutId = setTimeout(() => {
                    reject(new Error('Connection timeout'));
                }, this.connectionTimeout);

                // Connect to WebSocket namespace
                this.socket = io(this.namespace, {
                    transports: ['websocket', 'polling'], // Allow polling as fallback
                    path: '/socket.io/', 
                    reconnection: true,
                    reconnectionAttempts: this.maxReconnectAttempts,
                    reconnectionDelay: 1000,
                    reconnectionDelayMax: 5000,
                    timeout: 20000,
                    forceNew: true // Force new connection
                });
                
                // Set up event handlers
                this._setupEventHandlers();
                
                // Handle connection success
                this.socket.on('connect', () => {
                    clearTimeout(timeoutId);
                    this.connected = true;
                    this.reconnectAttempts = 0;
                    console.log('WebSocket connected successfully');
                    resolve();
                });
                
                // Handle connection failure
                this.socket.on('connect_error', (error) => {
                    clearTimeout(timeoutId);
                    console.error('WebSocket connection error:', error);
                    this.connected = false;
                    
                    this.reconnectAttempts++;
                    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                        reject(new Error(`Failed to connect after ${this.maxReconnectAttempts} attempts: ${error.message}`));
                    }
                });

                // Handle disconnection
                this.socket.on('disconnect', (reason) => {
                    console.log('WebSocket disconnected:', reason);
                    this.connected = false;
                    this._triggerHandlers('disconnected', { reason });
                });
                
            } catch (error) {
                console.error('Failed to create WebSocket connection:', error);
                reject(error);
            }
        });
    }
    
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.connected = false;
            this.sessionId = null;
            console.log('WebSocket disconnected');
        }
    }
    
    emit(event, data) {
        if (!this.socket || !this.connected) {
            console.error('Cannot emit - not connected to WebSocket');
            return false;
        }
        
        try {
            this.socket.emit(event, data);
            return true;
        } catch (error) {
            console.error('Failed to emit event:', error);
            return false;
        }
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
        if (!this.socket) return;

        // Connection events
        this.socket.on('connected', (data) => {
            console.log('Session connected:', data);
            this.sessionId = data.session_id;
            this._triggerHandlers('connected', data);
        });
        
        // Session events
        this.socket.on('session_started', (data) => {
            console.log('Realtime session started:', data);
            this._triggerHandlers('session_started', data);
        });
        
        this.socket.on('session_update', (data) => {
            this._triggerHandlers('session_update', data);
        });
        
        // Audio/transcript events
        this.socket.on('transcript', (data) => {
            this._triggerHandlers('transcript', data);
        });
        
        this.socket.on('audio_chunk', (data) => {
            this._triggerHandlers('audio_chunk', data);
        });
        
        // Itinerary events
        this.socket.on('render_itinerary', (data) => {
            console.log('Received render_itinerary event:', data);
            this._triggerHandlers('render_itinerary', data);
        });
        
        // Error events
        this.socket.on('error', (data) => {
            console.error('WebSocket error event:', data);
            this._triggerHandlers('error', data);
        });
        
        // Stats events
        this.socket.on('stats', (data) => {
            this._triggerHandlers('stats', data);
        });
        
        this.socket.on('global_stats', (data) => {
            this._triggerHandlers('global_stats', data);
        });

        // Handle interruption acknowledgment
        this.socket.on('interrupted', (data) => {
            console.log('Interruption acknowledged:', data);
            this._triggerHandlers('interrupted', data);
        });
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
    if (!audioData || audioData.byteLength === 0) return false;
    // Base64-encode the chunk
    const b64 = btoa(
        String.fromCharCode.apply(null, new Uint8Array(audioData))
    );
        return this.emit('audio_data', { audio: b64 });
    }

    commitAudio() {
        console.log('[WebSocketClient] Committing audio buffer...');
        const success = this.emit('commit_audio', {});
        console.log('[WebSocketClient] Commit audio result:', success);
        return success;
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
        return this.connected && this.socket && this.socket.connected;
    }
    
    getSessionId() {
        return this.sessionId;
    }
    
    getConnectionState() {
        return {
            connected: this.connected,
            sessionId: this.sessionId,
            reconnectAttempts: this.reconnectAttempts,
            socketConnected: this.socket ? this.socket.connected : false
        };
    }
}

// Export for use in other modules
window.WebSocketClient = WebSocketClient;