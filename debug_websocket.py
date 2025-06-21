#!/usr/bin/env python3
"""
WebSocket Connection Diagnostic Script
Run this to test if the WebSocket server is working properly
"""

import asyncio
import websockets
import requests
import json
import sys
from urllib.parse import urlparse

def test_http_endpoints(base_url):
    """Test HTTP endpoints to ensure server is running"""
    print("🔍 Testing HTTP endpoints...")
    
    endpoints = [
        "/health",
        "/debug", 
        "/test-socketio"
    ]
    
    for endpoint in endpoints:
        try:
            url = f"{base_url}{endpoint}"
            response = requests.get(url, timeout=10)
            print(f"✅ {endpoint}: {response.status_code}")
            if endpoint == "/debug":
                data = response.json()
                print(f"   Server info: {data}")
        except Exception as e:
            print(f"❌ {endpoint}: {e}")

def test_websocket_connection(base_url):
    """Test WebSocket connection"""
    print("\n🔍 Testing WebSocket connection...")
    
    # Parse the base URL to get WebSocket URL
    parsed = urlparse(base_url)
    ws_url = f"ws://{parsed.netloc}/socket.io/?EIO=4&transport=websocket"
    
    print(f"WebSocket URL: {ws_url}")
    
    try:
        # This is a basic test - in practice, you'd use a proper Socket.IO client
        print("⚠️  WebSocket test requires a proper Socket.IO client")
        print("   Please use the browser test at /test-socketio")
        return True
    except Exception as e:
        print(f"❌ WebSocket test failed: {e}")
        return False

def main():
    """Main diagnostic function"""
    print("🚀 WebSocket Connection Diagnostics")
    print("=" * 50)
    
    # Default to localhost if no URL provided
    base_url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5000"
    
    print(f"Testing server at: {base_url}")
    print()
    
    # Test HTTP endpoints
    test_http_endpoints(base_url)
    
    # Test WebSocket (basic)
    test_websocket_connection(base_url)
    
    print("\n📋 Next Steps:")
    print("1. Open your browser and go to: {}/test-socketio".format(base_url))
    print("2. Check the browser console for connection status")
    print("3. If that fails, check server logs for errors")
    print("4. Ensure all dependencies are installed: pip install -r requirements.txt")

if __name__ == "__main__":
    main() 