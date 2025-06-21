// static/js/realtime/websocket_connection.js - WebSocket Connection Management
// Extracted from websocket_client.js to handle connection logic

class WebSocketConnection {
    constructor(namespace = '/travel/ws') {
        this.socket = null;
        this.connected = false;
        this.namespace = namespace;
        
        // Connection settings
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.connectionTimeout = 10000; // 10 seconds
        
        console.log('WebSocketConnection initialized');
    }
    
    /**
     * Establish WebSocket connection
     * @returns {Promise} Resolves when connected, rejects on failure
     */
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
                    transports: ['websocket', 'polling'],
                    path: '/socket.io', 
                    reconnection: true,
                    reconnectionAttempts: this.maxReconnectAttempts,
                    reconnectionDelay: 1000,
                    reconnectionDelayMax: 5000,
                    timeout: 20000,
                    forceNew: true
                });
                
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
                
            } catch (error) {
                console.error('Failed to create WebSocket connection:', error);
                reject(error);
            }
        });
    }
    
    /**
     * Disconnect WebSocket
     */
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.connected = false;
            console.log('WebSocket disconnected');
        }
    }
    
    /**
     * Emit event through WebSocket
     * @param {string} event - Event name
     * @param {*} data - Event data
     * @returns {boolean} Success status
     */
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
    
    /**
     * Add event listener
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     */
    on(event, handler) {
        if (this.socket) {
            this.socket.on(event, handler);
        }
    }
    
    /**
     * Remove event listener
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     */
    off(event, handler) {
        if (this.socket) {
            this.socket.off(event, handler);
        }
    }
    
    /**
     * Check if connected
     * @returns {boolean} Connection status
     */
    isConnected() {
        return this.connected && this.socket && this.socket.connected;
    }
    
    /**
     * Get connection state
     * @returns {Object} Connection state info
     */
    getConnectionState() {
        return {
            connected: this.connected,
            reconnectAttempts: this.reconnectAttempts,
            socketConnected: this.socket ? this.socket.connected : false,
            namespace: this.namespace
        };
    }
}

// Export for use in other modules
window.WebSocketConnection = WebSocketConnection;