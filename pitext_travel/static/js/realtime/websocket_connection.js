// static/js/realtime/websocket_connection.js - WebSocket Connection Management
// Extracted from websocket_client.js to handle connection logic

// Global connection tracking to prevent duplicates
window.WebSocketConnections = window.WebSocketConnections || {};
window.WebSocketConnectionStates = window.WebSocketConnectionStates || {};

class WebSocketConnection {
    constructor(namespace = '/travel/ws') {
        if (window.WebSocketConnections[namespace]) {
            console.log(`Reusing existing connection for ${namespace}`);
            return window.WebSocketConnections[namespace];
        }

        this.socket = null;
        this.connected = false;
        this.namespace = namespace;
        this.connecting = false;
        this.connectionPromise = null;
        
        // Simplified connection settings
        this.connectionTimeout = 20000; // Increased to 20s for WebSocket handshake behind proxy

        window.WebSocketConnections[namespace] = this;
        console.log('WebSocketConnection initialized for single, direct WebSocket attempt.');
    }

    /**
     * Establish a direct WebSocket connection.
     * @returns {Promise} Resolves when connected, rejects on failure.
     */
    connect() {
        if (this.connectionPromise) {
            console.log('Connection attempt in progress, returning existing promise.');
            return this.connectionPromise;
        }

        this.connectionPromise = new Promise((resolve, reject) => {
            if (this.connected && this.socket && this.socket.connected) {
                console.log('Already connected.');
                resolve();
                return;
            }

            if (!window.io) {
                this.connectionPromise = null;
                reject(new Error('Socket.IO client library not loaded'));
                return;
            }

            this._attemptConnection(resolve, reject);
        });

        return this.connectionPromise;
    }

    /**
     * Perform a single, direct WebSocket connection attempt.
     */
    _attemptConnection(resolve, reject) {
        this.connecting = true;
        console.log(`Attempting direct WebSocket connection to ${this.namespace}...`);

        // Clean up any old socket instance
        if (this.socket) {
            this.socket.disconnect();
        }

        const timeoutId = setTimeout(() => {
            this.connecting = false;
            this.connectionPromise = null;
            if (this.socket) {
                this.socket.disconnect();
            }
            console.error(`Connection timeout after ${this.connectionTimeout}ms`);
            reject(new Error('Connection timeout'));
        }, this.connectionTimeout);

        this.socket = io(this.namespace, {
            path: '/socket.io',
            transports: ['websocket'], // Force WebSocket transport ONLY
            reconnection: false,
            timeout: this.connectionTimeout,
            forceNew: true,
            upgrade: false, // Disables the HTTP upgrade mechanism
        });

        this.socket.on('connect', () => {
            clearTimeout(timeoutId);
            this.connected = true;
            this.connecting = false;
            this.connectionPromise = null;
            console.log('✅ WebSocket connected successfully.');
            resolve();
        });

        this.socket.on('connect_error', (error) => {
            clearTimeout(timeoutId);
            this.connected = false;
            this.connecting = false;
            this.connectionPromise = null;
            console.error('❌ WebSocket connection error:', error.message);
            reject(new Error(`Connection failed: ${error.message}`));
        });

        this.socket.on('disconnect', (reason) => {
            console.log('WebSocket disconnected:', reason);
            this.connected = false;
            this.connecting = false;
            this.connectionPromise = null;
        });
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
        }
        this.socket = null;
        this.connected = false;
        this.connecting = false;
        this.connectionPromise = null;
        console.log('WebSocket disconnected.');
    }

    emit(event, data) {
        if (!this.socket || !this.connected) {
            console.error('Cannot emit - not connected to WebSocket');
            return false;
        }
        this.socket.emit(event, data);
        return true;
    }

    on(event, handler) {
        if (this.socket) {
            this.socket.on(event, handler);
        }
    }

    off(event, handler) {
        if (this.socket) {
            this.socket.off(event, handler);
        }
    }
    
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
            socketConnected: this.socket ? this.socket.connected : false,
            namespace: this.namespace
        };
    }
}

// Export for use in other modules
window.WebSocketConnection = WebSocketConnection;