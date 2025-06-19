// static/js/realtime/websocket_event_setup.js - WebSocket Event Setup
// Extracted from websocket_client.js to handle event wiring

const WebSocketEventSetup = {
    /**
     * Set up all WebSocket event handlers
     * @param {WebSocketConnection} connection - Connection instance
     * @param {WebSocketClient} client - Client instance
     */
    setupEvents(connection, client) {
        // Connection events
        connection.on('connected', (data) => {
            console.log('Session connected:', data);
            client.sessionId = data.session_id;
            client._triggerHandlers('connected', data);
        });
        
        connection.on('disconnect', (reason) => {
            console.log('WebSocket disconnected:', reason);
            client.sessionId = null;
            client._triggerHandlers('disconnected', { reason });
        });
        
        // Session events
        connection.on('session_started', (data) => {
            console.log('Realtime session started:', data);
            client._triggerHandlers('session_started', data);
        });
        
        connection.on('session_update', (data) => {
            client._triggerHandlers('session_update', data);
        });
        
        // OpenAI VAD events
        connection.on('speech_started', (data) => {
            console.log('OpenAI VAD: Speech started event received');
            client._triggerHandlers('speech_started', data);
        });
        
        connection.on('speech_stopped', (data) => {
            console.log('OpenAI VAD: Speech stopped event received');
            client._triggerHandlers('speech_stopped', data);
        });
        
        // Audio/transcript events
        connection.on('transcript', (data) => {
            client._triggerHandlers('transcript', data);
        });
        
        connection.on('audio_chunk', (data) => {
            client._triggerHandlers('audio_chunk', data);
        });
        
        // Response events
        connection.on('response_started', (data) => {
            console.log('Response generation started');
            client._triggerHandlers('response_started', data);
        });
        
        connection.on('response_done', (data) => {
            console.log('Response generation complete');
            client._triggerHandlers('response_done', data);
        });
        
        // Itinerary events
        connection.on('render_itinerary', (data) => {
            console.log('Received render_itinerary event:', data);
            client._triggerHandlers('render_itinerary', data);
        });
        
        // Error events
        connection.on('error', (data) => {
            console.error('WebSocket error event:', data);
            client._triggerHandlers('error', data);
        });
        
        // Map ready check
        connection.on('check_map_ready', (data) => {
            client._triggerHandlers('check_map_ready', data);
        });
        
        // Stats events
        connection.on('stats', (data) => {
            client._triggerHandlers('stats', data);
        });

        // Handle interruption acknowledgment
        connection.on('interrupted', (data) => {
            console.log('Interruption acknowledged:', data);
            client._triggerHandlers('interrupted', data);
        });
    }
};

// Export for use in WebSocketClient
window.WebSocketEventSetup = WebSocketEventSetup;