// static/js/utils/test-websocket.js
// Simple WebSocket connection test

window.WebSocketTester = {
    /**
     * Test basic WebSocket connection
     */
    async testConnection() {
        console.log("🧪 Testing WebSocket connection...");
        
        if (!window.io) {
            console.error("❌ Socket.IO not loaded");
            return false;
        }
        
        return new Promise((resolve) => {
            const socket = io('/travel/ws', {
                path: '/socket.io',
                timeout: 15000,
                transports: ['websocket', 'polling']
            });
            
            const timeout = setTimeout(() => {
                console.error("❌ Connection timeout");
                socket.disconnect();
                resolve(false);
            }, 15000);
            
            socket.on('connect', () => {
                clearTimeout(timeout);
                console.log("✅ Connected successfully");
                
                // Test ping/pong
                socket.emit('ping');
                socket.on('pong', (data) => {
                    console.log("✅ Ping/pong successful:", data);
                });
                
                // Test custom event
                socket.emit('test', { message: 'Hello from client' });
                socket.on('test_response', (data) => {
                    console.log("✅ Test event successful:", data);
                });
                
                setTimeout(() => {
                    socket.disconnect();
                    resolve(true);
                }, 2000);
            });
            
            socket.on('connect_error', (error) => {
                clearTimeout(timeout);
                console.error("❌ Connection error:", error);
                resolve(false);
            });
            
            socket.on('error', (error) => {
                console.error("❌ Socket error:", error);
            });
        });
    },
    
    /**
     * Run all tests
     */
    async runTests() {
        console.log("🚀 Starting WebSocket tests...");
        
        const results = {
            socketioLoaded: !!window.io,
            connectionTest: false,
            timestamp: new Date().toISOString()
        };
        
        if (results.socketioLoaded) {
            results.connectionTest = await this.testConnection();
        }
        
        console.log("📊 Test results:", results);
        return results;
    }
};

// Auto-run tests if debug parameter is present
if (window.location.search.includes('test=websocket')) {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            window.WebSocketTester.runTests();
        }, 1000);
    });
} 