// static/js/realtime/websocket_connection.js - WebSocket Connection Management
// Extracted from websocket_client.js to handle connection logic

// Global connection tracking to prevent duplicates
window.WebSocketConnections = window.WebSocketConnections || {};
window.WebSocketConnectionStates = window.WebSocketConnectionStates || {};

class WebSocketConnection {
    constructor(namespace = '/travel/ws') {
        // Check if connection already exists for this namespace
        if (window.WebSocketConnections[namespace]) {
            console.log(`Reusing existing connection for ${namespace}`);
            return window.WebSocketConnections[namespace];
        }
        
        this.socket = null;
        this.connected = false;
        this.namespace = namespace;
        this.connecting = false; // Track connection state
        this.connectionPromise = null;
        
        // Connection settings
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.connectionTimeout = 10000; // 10 seconds
        
        // Store this instance globally
        window.WebSocketConnections[namespace] = this;
        
        console.log('WebSocketConnection initialized');
    }
    
    /**
     * Establish WebSocket connection
     * @returns {Promise} Resolves when connected, rejects on failure
     */
    connect() {
        // If a connection attempt is already in progress, return its promise
        if (this.connectionPromise) {
            console.log('WebSocket connection attempt in progress, returning existing promise.');
            return this.connectionPromise;
        }

        // Start a new connection attempt
        this.connectionPromise = new Promise((resolve, reject) => {
            // Check if already connected
            if (this.connected && this.socket && this.socket.connected) {
                console.log('WebSocket already connected, resolving immediately.');
                resolve();
                return;
            }
            
            // Check if Socket.IO is available
            if (!window.io) {
                this.connectionPromise = null; // Clear promise
                reject(new Error('Socket.IO client library not loaded'));
                return;
            }

            try {
                console.log(`Attempting to connect to ${this.namespace}...`);
                this.connecting = true;
                
                // Create connection with timeout
                const timeoutId = setTimeout(() => {
                    this.connecting = false;
                    this.connectionPromise = null; // Clear promise on timeout
                    if (this.socket) {
                        this.socket.disconnect();
                    }
                    console.error(`Connection timeout after ${this.connectionTimeout}ms`);
                    reject(new Error('Connection timeout'));
                }, this.connectionTimeout);

                // Connect to WebSocket namespace with more detailed options
                this.socket = io(this.namespace, {
                    transports: ['websocket', 'polling'],
                    path: '/socket.io', 
                    reconnection: true,
                    reconnectionAttempts: this.maxReconnectAttempts,
                    reconnectionDelay: 1000,
                    reconnectionDelayMax: 5000,
                    timeout: 20000,
                    forceNew: false,
                    // Add additional debugging
                    autoConnect: true,
                    upgrade: true,
                    rememberUpgrade: true
                });
                
                // Handle connection success
                this.socket.on('connect', () => {
                    clearTimeout(timeoutId);
                    this.connected = true;
                    this.connecting = false;
                    this.reconnectAttempts = 0;
                    console.log('WebSocket connected successfully');
                    resolve();
                });
                
                // Handle connection failure
                this.socket.on('connect_error', (error) => {
                    clearTimeout(timeoutId);
                    console.error('WebSocket connection error:', error);
                    this.connected = false;
                    this.connecting = false;
                    this.connectionPromise = null; // Clear promise on error
                    
                    this.reconnectAttempts++;
                    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                        reject(new Error(`Failed to connect after ${this.maxReconnectAttempts} attempts: ${error.message}`));
                    }
                });
                
                // Handle transport errors
                this.socket.on('error', (error) => {
                    console.error('WebSocket transport error:', error);
                });
                
                // Handle disconnect
                this.socket.on('disconnect', (reason) => {
                    console.log('WebSocket disconnected:', reason);
                    this.connected = false;
                    this.connecting = false;
                });
                
            } catch (error) {
                this.connecting = false;
                this.connectionPromise = null; // Clear promise on exception
                console.error('Failed to create WebSocket connection:', error);
                reject(error);
            }
        });

        return this.connectionPromise;
    }
    
    /**
     * Disconnect WebSocket
     */
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
        }
        this.socket = null;
        this.connected = false;
        this.connecting = false;
        this.connectionPromise = null; // Also clear promise on disconnect
        console.log('WebSocket disconnected');
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