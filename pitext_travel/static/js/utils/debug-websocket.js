// static/js/utils/debug-websocket.js
// WebSocket connection debugging utility

window.WebSocketDebugger = {
    /**
     * Test basic Socket.IO connectivity
     */
    async testBasicConnection() {
        console.log("🔍 Testing basic Socket.IO connection...");
        
        if (!window.io) {
            console.error("❌ Socket.IO client library not loaded");
            return false;
        }
        
        try {
            // Test default namespace first
            const defaultSocket = io('/', { 
                path: '/socket.io',
                timeout: 5000,
                transports: ['websocket', 'polling']
            });
            
            return new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    console.error("❌ Default namespace connection timeout");
                    defaultSocket.disconnect();
                    resolve(false);
                }, 5000);
                
                defaultSocket.on('connect', () => {
                    clearTimeout(timeout);
                    console.log("✅ Default namespace connected successfully");
                    defaultSocket.disconnect();
                    resolve(true);
                });
                
                defaultSocket.on('connect_error', (error) => {
                    clearTimeout(timeout);
                    console.error("❌ Default namespace connection error:", error);
                    resolve(false);
                });
            });
            
        } catch (error) {
            console.error("❌ Socket.IO connection test failed:", error);
            return false;
        }
    },
    
    /**
     * Test travel namespace connection
     */
    async testTravelNamespace() {
        console.log("🔍 Testing /travel/ws namespace connection...");
        
        if (!window.io) {
            console.error("❌ Socket.IO client library not loaded");
            return false;
        }
        
        try {
            const travelSocket = io('/travel/ws', { 
                path: '/socket.io',
                timeout: 10000,
                transports: ['websocket', 'polling']
            });
            
            return new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    console.error("❌ Travel namespace connection timeout");
                    travelSocket.disconnect();
                    resolve(false);
                }, 10000);
                
                travelSocket.on('connect', () => {
                    clearTimeout(timeout);
                    console.log("✅ Travel namespace connected successfully");
                    travelSocket.disconnect();
                    resolve(true);
                });
                
                travelSocket.on('connect_error', (error) => {
                    clearTimeout(timeout);
                    console.error("❌ Travel namespace connection error:", error);
                    resolve(false);
                });
                
                travelSocket.on('error', (error) => {
                    clearTimeout(timeout);
                    console.error("❌ Travel namespace error event:", error);
                    resolve(false);
                });
            });
            
        } catch (error) {
            console.error("❌ Travel namespace connection test failed:", error);
            return false;
        }
    },
    
    /**
     * Run comprehensive connection diagnostics
     */
    async runDiagnostics() {
        console.log("🚀 Starting WebSocket connection diagnostics...");
        
        const results = {
            socketioLoaded: !!window.io,
            basicConnection: false,
            travelNamespace: false,
            timestamp: new Date().toISOString()
        };
        
        if (!results.socketioLoaded) {
            console.error("❌ Socket.IO not loaded - check if socketio-loader.js is working");
            return results;
        }
        
        console.log("✅ Socket.IO client library loaded");
        
        // Test basic connection
        results.basicConnection = await this.testBasicConnection();
        
        // Test travel namespace
        results.travelNamespace = await this.testTravelNamespace();
        
        // Summary
        console.log("📊 Connection Diagnostics Summary:", results);
        
        if (results.basicConnection && !results.travelNamespace) {
            console.error("⚠️ Basic Socket.IO works but travel namespace fails - check server-side namespace registration");
        } else if (!results.basicConnection) {
            console.error("⚠️ Basic Socket.IO connection fails - check server configuration");
        }
        
        return results;
    },
    
    /**
     * Check server status via HTTP
     */
    async checkServerStatus() {
        console.log("🔍 Checking server status...");
        
        try {
            const response = await fetch('/debug');
            const data = await response.json();
            console.log("📊 Server status:", data);
            return data;
        } catch (error) {
            console.error("❌ Failed to check server status:", error);
            return null;
        }
    }
};

// Auto-run diagnostics when loaded (for debugging)
if (window.location.search.includes('debug=websocket')) {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            window.WebSocketDebugger.runDiagnostics();
        }, 1000);
    });
} 