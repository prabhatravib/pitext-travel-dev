// static/js/app.js – Main Application Entry Point with Enhanced Voice-Map Integration

// Store trip data globally
let tripData = null;

// Connection state flags
let wsConnected = false;
let realtimeReady = false;
let mapReadySent = false;

/**
 * Initialize the application when DOM is ready
 */
document.addEventListener("DOMContentLoaded", () => {
    const { debugLog } = window.TravelHelpers;
    debugLog("DOM loaded, setting up travel planner...");

    // Initialize core UI components
    window.TravelPanel.initializePanel();
    window.TravelForm.initializeForm();

    // Initialize communication first, then maps
    initializeCommunication();
    
    // Start loading Google Maps API
    loadGoogleMapsAPI();
});

/**
 * Initialize communication (WebSocket for voice or HTTP for text)
 */
function initializeCommunication() {
    const { debugLog } = window.TravelHelpers;

    const hasWebSocketSupport = 'WebSocket' in window;
    const hasAudioSupport = navigator.mediaDevices && navigator.mediaDevices.getUserMedia;

    if (hasWebSocketSupport && hasAudioSupport) {
        debugLog("Browser supports WebSocket and audio - initializing voice chat");
        // Delay WebSocket initialization to ensure Socket.IO is loaded
        setTimeout(initializeWebSocket, 500);
    } else {
        debugLog("Using HTTP‑based text chat (WebSocket or audio not supported)");
        // Text chat fallback
        initializeTextChatFallback();
    }
}

/**
 * Initialize WebSocket connection for Realtime API
 */
function initializeWebSocket() {
    const { debugLog, errorLog } = window.TravelHelpers;

    if (!window.io) {
        debugLog("Socket.IO not loaded yet, retrying...");
        return setTimeout(initializeWebSocket, 500);
    }
    
    if (!window.RealtimeController) {
        debugLog("RealtimeController not loaded yet, deferring WebSocket init");
        return setTimeout(initializeWebSocket, 100);
    }

    try {
        // Initialize voice UI integration
        if (window.voiceUI && window.voiceUI.controller) {
            setupVoiceIntegration(window.voiceUI.controller);
        } else {
            debugLog("Voice UI not ready, will setup integration later");
        }
    } catch (error) {
        errorLog("Failed to initialize WebSocket:", error);
        // Fall back to text chat
        initializeTextChatFallback();
    }
}

/**
 * Set up voice integration with map rendering
 */
function setupVoiceIntegration(realtimeController) {
    const { debugLog, errorLog } = window.TravelHelpers;
    
    debugLog("Setting up voice-map integration");

    // Event: connected
    realtimeController.on('connected', () => {
        wsConnected = true;
        debugLog("WebSocket connected successfully");
    });

    // Event: ready for voice
    realtimeController.on('ready', () => {
        realtimeReady = true;
        debugLog("Realtime API ready for voice interaction");
    });

    // Event: error
    realtimeController.on('error', (err) => {
        errorLog("Realtime error:", err);
        if (err.critical) {
            wsConnected = false;
            realtimeReady = false;
        }
    });

    // Event: itinerary data - THIS IS THE KEY INTEGRATION
    realtimeController.on('render_itinerary', (data) => {
        debugLog("🎤 Voice command generated itinerary:", data);
        
        if (data.itinerary) {
            tripData = data.itinerary;
            
            // Ensure map is ready before rendering
            if (window.mapModulesReady && window.TravelGoogleMaps.isMapLoaded()) {
                debugLog("🗺️ Map ready, rendering itinerary immediately");
                renderTripOnMap(data.itinerary);
                
                // Notify backend that map is ready for voice interaction
                if (!mapReadySent && realtimeController.wsClient) {
                    realtimeController.wsClient.emit('map_ready', {});
                    mapReadySent = true;
                }
            } else {
                debugLog("🗺️ Map not ready, queuing itinerary for later render");
                window.pendingRender = data.itinerary;
            }
        }
    });

    // Event: transcript for chat display
    realtimeController.on('transcript', (data) => {
        if (window.chatInstance) {
            window.chatInstance.updateTranscript(data);
        }
    });

    debugLog("Voice integration setup complete");
}

/**
 * Text chat fallback initialization
 */
function initializeTextChatFallback() {
    const { debugLog } = window.TravelHelpers;
    debugLog("Initializing text chat fallback");
    
    // Hide voice button if voice is not available
    const voiceBtn = document.getElementById('voice-button');
    if (voiceBtn) {
        voiceBtn.style.display = 'none';
    }
    
    // Text chat integration would go here
    // This can interface with existing HTTP chat endpoint
}

/**
 * Load Google Maps API dynamically
 */
async function loadGoogleMapsAPI() {
    const { debugLog, errorLog } = window.TravelHelpers;
    const { showError } = window.TravelOverlays;
    const { loadGoogleMapsConfig, createMapsScriptUrl, loadGoogleMapsScript } = window.TravelConfig;

    try {
        debugLog("Loading Google Maps configuration...");
        const config = await loadGoogleMapsConfig();
        
        debugLog("Creating Maps script URL...");
        const scriptUrl = createMapsScriptUrl(config);
        
        debugLog("Loading Google Maps script...");
        await loadGoogleMapsScript(scriptUrl);
        
        debugLog("Google Maps script loaded successfully");
    } catch (error) {
        errorLog("Failed to load Google Maps:", error);
        showError(`Failed to load Google Maps: ${error.message}`);
    }
}

/**
 * Callback once Google Maps script has loaded
 */
window.initializeApp = function () {
    const { debugLog, errorLog } = window.TravelHelpers;
    const { initializeGoogleMap } = window.TravelGoogleMaps;

    debugLog('🗺️ Google Maps API loaded, initializing map...');

    try {
        // Initialize the map
        initializeGoogleMap();
        
        // Load map modules
        if (window.loadMapModules) {
            debugLog('Loading map modules...');
            window.loadMapModules();
        } else {
            errorLog('loadMapModules function not found');
        }
        
        // Check for pending renders after a short delay
        setTimeout(() => {
            if (window.pendingRender) {
                debugLog('🗺️ Processing pending render after map initialization');
                renderTripOnMap(window.pendingRender);
                window.pendingRender = null;
            }
        }, 1000);
        
    } catch (error) {
        errorLog('Map initialization failed:', error);
        window.TravelOverlays.showError(`Map initialization failed: ${error.message}`);
    }
};

/**
 * HTTP-based itinerary processing (fallback)
 */
async function processItinerary(city, days) {
    const { debugLog, errorLog } = window.TravelHelpers;
    const { showLoading, showError, hideOverlay } = window.TravelOverlays;
    const { isMapLoaded } = window.TravelGoogleMaps;
    const { fetchItinerary } = window.TravelAPI;

    if (!isMapLoaded()) {
        return showError("Google Maps is still loading. Please wait a moment and try again.");
    }

    if (isVoiceAvailable()) {
        debugLog("Voice is available - user should use voice interface instead");
        return;
    }

    showLoading("Generating your trip itinerary!");
    
    try {
        const data = await fetchItinerary(city, days);
        tripData = data;
        renderTripOnMap(data);
        hideOverlay();
    } catch (error) {
        errorLog("Failed to process itinerary:", error);
        showError(`Failed to load itinerary: ${error.message}`);
    }
}

/**
 * Render the trip on Google Maps - ENHANCED VERSION
 */
function renderTripOnMap(data) {
    const { debugLog, errorLog } = window.TravelHelpers;
    const { showError } = window.TravelOverlays;
    const { fitMapToBounds } = window.TravelGoogleMaps;

    if (!data || !data.days || data.days.length === 0) {
        errorLog("Invalid itinerary data:", data);
        showError("No itinerary data to display");
        return;
    }

    // Check if map modules are ready
    if (!window.mapModulesReady) {
        debugLog("Map modules not ready, storing for later render...");
        window.pendingRender = data;
        return;
    }

    // Check if required modules exist
    if (!window.TravelMarkers || !window.TravelRoutes || !window.TravelControls) {
        errorLog("Required map modules not loaded");
        showError("Map modules not loaded properly");
        return;
    }

    debugLog("🗺️ Rendering trip on map with", data.days.length, "days");

    try {
        // Clear existing elements
        window.TravelMarkers.clearAllMarkers();
        window.TravelRoutes.clearAllRoutes();
        window.TravelControls.clearDayControls();

        // Create markers and get bounds
        const { bounds, totalStops } = window.TravelMarkers.createAllMarkers(data);
        debugLog("Created markers for", totalStops, "total stops");

        // Create routes
        window.TravelRoutes.createAllRoutes(data);
        debugLog("Created routes for all days");

        // Hide all days except the first one initially
        data.days.forEach((_, idx) => {
            if (idx > 0) {
                window.TravelMarkers.toggleMarkersForDay(idx, false);
                window.TravelRoutes.toggleRoutesForDay(idx, false);
            }
        });

        // Fit map to bounds
        fitMapToBounds(bounds, totalStops);

        // Render day controls
        window.TravelControls.renderDayControls(data.days);

        debugLog("✅ Trip rendering complete!");
        
        // Reset map ready flag for next rendering
        mapReadySent = false;
        
    } catch (error) {
        errorLog("Error rendering trip:", error);
        showError(`Failed to render trip: ${error.message}`);
    }
}

/**
 * Is voice interface available?
 */
function isVoiceAvailable() {
    return wsConnected && realtimeReady && window.voiceUI && window.voiceUI.isReady;
}

/**
 * Clear all map elements
 */
function clearMapElements() {
    if (window.TravelMarkers) window.TravelMarkers.clearAllMarkers();
    if (window.TravelRoutes) window.TravelRoutes.clearAllRoutes();
    if (window.TravelControls) window.TravelControls.clearDayControls();
}

// Global error handler for Maps script failures
window.addEventListener('error', function (e) {
    if (e.filename && e.filename.includes('maps.googleapis.com')) {
        console.error('Google Maps script error:', e.message || e.error.message, e);
        window.TravelOverlays.showError(`
            <strong>Google Maps JavaScript failed to load</strong><br>
            <code>${e.message || e.error.message}</code>
        `);
    }
}, true);

// Expose public API
window.TravelApp = {
    processItinerary,
    renderTripOnMap,
    clearMapElements,
    isVoiceAvailable,
    setupVoiceIntegration  // Expose for later use
};