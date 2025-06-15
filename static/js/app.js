// static/js/app.js - Main Application Entry Point with WebSocket support

// Store trip data globally
let tripData = null;

// WebSocket connection state
let wsConnected = false;
let realtimeReady = false;

/**
 * Initialize the application when DOM is ready
 */
document.addEventListener("DOMContentLoaded", () => {
    const { debugLog } = window.TravelHelpers;
    debugLog("DOM loaded, setting up travel planner...");
    
    // Initialize UI components
    window.TravelPanel.initializePanel();
    window.TravelForm.initializeForm();
    
    // Initialize voice/chat system based on browser support
    initializeCommunication();
    
    // Start loading Google Maps API
    loadGoogleMapsAPI();
});

/**
 * Initialize communication (WebSocket for voice or HTTP for text)
 */
function initializeCommunication() {
    const { debugLog } = window.TravelHelpers;
    
    // Check for WebSocket and audio support
    const hasWebSocketSupport = 'WebSocket' in window;
    const hasAudioSupport = navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    
    if (hasWebSocketSupport && hasAudioSupport) {
        debugLog("Browser supports WebSocket and audio - initializing voice chat");
        initializeWebSocket();
    } else {
        debugLog("Using HTTP-based text chat (WebSocket or audio not supported)");
        // Text chat is already initialized in chat.js
    }
}

/**
 * Initialize WebSocket connection for Realtime API
 */
function initializeWebSocket() {
    const { debugLog, errorLog } = window.TravelHelpers;
    
    // Check if Socket.IO is loaded
    if (!window.io) {
        debugLog("Socket.IO not loaded yet, retrying...");
        setTimeout(initializeWebSocket, 500);
        return;
    }
    
    
    // ... rest of the function remains the same    
    // Check if Realtime module is loaded
    if (!window.RealtimeController) {
        debugLog("Realtime module not loaded yet, deferring WebSocket init");
        setTimeout(initializeWebSocket, 100);
        return;
    }
    
    try {
        // Create Realtime controller instance
        const realtime = new window.RealtimeController();
        
        // Set up event handlers
        realtime.on('connected', () => {
            wsConnected = true;
            debugLog("WebSocket connected successfully");
        });
// Update the ready handler
        realtime.on('ready', () => {
            realtimeReady = true;
            debugLog("Realtime API ready for voice interaction");
            
            // Update mic button to show continuous listening mode
            const micBtn = document.getElementById('mic-btn');
            if (micBtn) {
                micBtn.classList.add('ready');
                // Change the icon or add a pulsing animation to indicate VAD mode
                micBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" width="24" height="24">
                        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2">
                            <animate attributeName="r" from="8" to="12" dur="1.5s" repeatCount="indefinite"/>
                            <animate attributeName="opacity" from="1" to="0.3" dur="1.5s" repeatCount="indefinite"/>
                        </circle>
                        <path d="M12 2a4 4 0 0 1 4 4v6a4 4 0 1 1-8 0V6a4 4 0 0 1 4-4z"/>
                    </svg>
                `;
                micBtn.title = "Voice assistant is listening...";
            }
        });     
        realtime.on('error', (error) => {
            errorLog("Realtime error:", error);
            // Fall back to text chat on critical errors
            if (error.critical) {
                wsConnected = false;
                realtimeReady = false;
            }
        });
        
        realtime.on('render_itinerary', (data) => {
            debugLog("Received itinerary from voice command:", data);
            if (data.itinerary) {
                tripData = data.itinerary;
                renderTripOnMap(data.itinerary);
            }
        });
        
        // Connect to WebSocket
        realtime.connect();
        
        // Store globally for other modules
        window.realtimeController = realtime;
        
    } catch (error) {
        errorLog("Failed to initialize WebSocket:", error);
    }
}

/**
 * Load Google Maps API dynamically
 */
async function loadGoogleMapsAPI() {
    const { debugLog } = window.TravelHelpers;
    const { showError } = window.TravelOverlays;
    const { loadGoogleMapsConfig, createMapsScriptUrl, loadGoogleMapsScript } = window.TravelConfig;
    
    try {
        // Load configuration
        const config = await loadGoogleMapsConfig();
        
        // Create script URL
        const scriptUrl = createMapsScriptUrl(config);
        
        // Load the script
        await loadGoogleMapsScript(scriptUrl);
        
    } catch (error) {
        showError(`Failed to load Google Maps: ${error.message}`);
    }
}

/**
 * Initialize when Google Maps API is loaded (callback function)
 */
window.initializeApp = function() {
    const { debugLog } = window.TravelHelpers;
    const { initializeGoogleMap } = window.TravelGoogleMaps;
    
    debugLog('Google Maps API loaded successfully');
    
    try {
        initializeGoogleMap();
        
        // Load map modules after Google Maps is initialized
        if (window.loadMapModules) {
            debugLog('Loading map modules...');
            window.loadMapModules();
        } else {
            debugLog('loadMapModules function not found!');
        }
        
    } catch (error) {
        const { showError } = window.TravelOverlays;
        showError(`Map initialization failed: ${error.message}`);
    }
};

/**
 * Process itinerary data (called from both voice and text interfaces)
 */
async function processItinerary(city, days) {
    const { debugLog } = window.TravelHelpers;
    const { showLoading, showError, hideOverlay } = window.TravelOverlays;
    const { isMapLoaded } = window.TravelGoogleMaps;
    const { fetchItinerary } = window.TravelAPI;
    
    if (!isMapLoaded()) {
        showError("Google Maps is still loading. Please wait a moment and try again.");
        return;
    }
    
    // Check if voice is active
    if (realtimeReady && window.realtimeController) {
        // Voice command will handle this through WebSocket
        debugLog("Processing itinerary through voice interface");
        return;
    }
    
    // Fall back to HTTP API
    showLoading("Generating your trip itinerary!");
    
    try {
        // Fetch itinerary
        const data = await fetchItinerary(city, days);
        
        // Store trip data
        tripData = data;
        
        // Render on map
        renderTripOnMap(data);
        
        // Hide loading
        hideOverlay();
        
    } catch (error) {
        showError(`Failed to load itinerary: ${error.message}`);
    }
}

/**
 * Render the complete trip on Google Maps
 */
function renderTripOnMap(data) {
    const { debugLog } = window.TravelHelpers;
    const { showError } = window.TravelOverlays;
    const { fitMapToBounds } = window.TravelGoogleMaps;

    // If modules aren't ready yet, store the data and wait
    if (!window.mapModulesReady) {
        debugLog("Map modules not ready yet, storing pending render...");
        window.pendingRender = data;
        return;
    }

    debugLog("Map modules ready, rendering trip...");

    // Modules are loaded, proceed with rendering
    const { createAllMarkers, clearAllMarkers } = window.TravelMarkers;
    const { createAllRoutes, clearAllRoutes } = window.TravelRoutes;
    const { renderDayControls, clearDayControls } = window.TravelControls;
    
    debugLog("Rendering trip on Google Maps...", data);
    
    if (!data.days || data.days.length === 0) {
        showError("No itinerary data to display");
        return;
    }
    
    // Clear existing elements
    clearMapElements();
    
    // Create markers
    const { bounds, totalStops } = createAllMarkers(data);
    
    // Create routes
    createAllRoutes(data);
    
    // Hide all days except the first one
    data.days.forEach((_, index) => {
        if (index > 0) {
            const { toggleMarkersForDay } = window.TravelMarkers;
            const { toggleRoutesForDay } = window.TravelRoutes;
            toggleMarkersForDay(index, false);
            toggleRoutesForDay(index, false);
        }
    });
            
    // Fit map to bounds
    fitMapToBounds(bounds, totalStops);
    
    // Render day controls
    renderDayControls(data.days);
    
    debugLog("Trip rendering complete!");
}

/**
 * Clear all map elements
 */
function clearMapElements() {
    const { debugLog } = window.TravelHelpers;

    // Check if modules exist before calling
    if (window.TravelMarkers && window.TravelMarkers.clearAllMarkers) {
        window.TravelMarkers.clearAllMarkers();
    }
    if (window.TravelRoutes && window.TravelRoutes.clearAllRoutes) {
        window.TravelRoutes.clearAllRoutes();
    }
    if (window.TravelControls && window.TravelControls.clearDayControls) {
        window.TravelControls.clearDayControls();
    }
    
    debugLog("Map elements cleared");
}

/**
 * Check if voice chat is available
 */
function isVoiceAvailable() {
    return wsConnected && realtimeReady;
}

// Global error handler for Google Maps script loading issues
window.addEventListener('error', function (e) {
    if (e.filename && e.filename.includes('maps.googleapis.com')) {
        const { showError } = window.TravelOverlays;
        const errMsg = e.message || (e.error && e.error.message) || 'Unknown script error';
        console.error('Google Maps script error:', errMsg, e);

        showError(`
            <strong>Google Maps JavaScript failed to load</strong><br><br>
            <code>${errMsg}</code><br><br>
            • Check internet connectivity.<br>
            • Verify the API Key / Client ID.<br>
            • Ensure your quota hasn't been exceeded.<br><br>
            See the browser console for the full stack trace.
        `);
    }
}, true);

// Export for other modules
window.TravelApp = {
    processItinerary,
    renderTripOnMap,
    clearMapElements,
    isVoiceAvailable
};