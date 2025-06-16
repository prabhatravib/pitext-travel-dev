// static/js/app.js – Main Application Entry Point with WebSocket support

// Store trip data globally
let tripData = null;

// WebSocket connection state
let wsConnected = false;
let realtimeReady = false;
let mapReadySent = false; // ensure we only emit once per itinerary render

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
        debugLog("Using HTTP‑based text chat (WebSocket or audio not supported)");
        // Text chat is already initialized in chat.js
    }
}

/**
 * Initialize WebSocket connection for Realtime API
 */
function initializeWebSocket() {
    const { debugLog, errorLog } = window.TravelHelpers;

    // Wait for Socket.IO to be present in the page
    if (!window.io) {
        debugLog("Socket.IO not loaded yet, retrying...");
        setTimeout(initializeWebSocket, 500);
        return;
    }

    // Wait for the dynamically imported Realtime module
    if (!window.RealtimeController) {
        debugLog("Realtime module not loaded yet, deferring WebSocket init");
        setTimeout(initializeWebSocket, 100);
        return;
    }

    try {
        // Create controller instance
        const realtime = new window.RealtimeController();

        // ✅ Store globally for other modules *before* wiring listeners that may reference it
        window.realtimeController = realtime;

        /* ------------------------------------------------------------------ */
        /*                               Events                               */
        /* ------------------------------------------------------------------ */

        realtime.on('connected', () => {
            wsConnected = true;
            debugLog("WebSocket connected successfully");
        });

        realtime.on('ready', () => {
            realtimeReady = true;
            debugLog("Realtime API ready for voice interaction");

            // UI feedback – pulsing mic icon
            const micBtn = document.getElementById('mic-btn');
            if (micBtn) {
                micBtn.classList.add('ready');
                micBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" width="24" height="24">
                        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2">
                            <animate attributeName="r" from="8" to="12" dur="1.5s" repeatCount="indefinite" />
                            <animate attributeName="opacity" from="1" to="0.3" dur="1.5s" repeatCount="indefinite" />
                        </circle>
                        <path d="M12 2a4 4 0 0 1 4 4v6a4 4 0 1 1-8 0V6a4 4 0 0 1 4-4z" />
                    </svg>`;
                micBtn.title = "Voice assistant is listening...";
            }
        });

        realtime.on('error', (error) => {
            errorLog("Realtime error:", error);
            if (error.critical) {
                wsConnected = false;
                realtimeReady = false;
            }
        });

        // 🔑 MAIN callback – itinerary delivered from backend
        realtime.on('render_itinerary', (data) => {
            debugLog("Received itinerary from voice command:", data);
            if (data.itinerary) {
                tripData = data.itinerary;
                renderTripOnMap(data.itinerary);

                // Once the map is drawn, notify the backend exactly once
                if (!mapReadySent && realtime.wsClient) {
                    realtime.wsClient.emit('map_ready', {});
                    mapReadySent = true;
                }
            }
        });

        // Finally, open the socket connection
        realtime.connect();

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
        const config = await loadGoogleMapsConfig();
        const scriptUrl = createMapsScriptUrl(config);
        await loadGoogleMapsScript(scriptUrl);
    } catch (error) {
        showError(`Failed to load Google Maps: ${error.message}`);
    }
}

/**
 * Initialize when Google Maps API is loaded (callback function)
 */
window.initializeApp = function () {
    const { debugLog } = window.TravelHelpers;
    const { initializeGoogleMap } = window.TravelGoogleMaps;

    debugLog('Google Maps API loaded successfully');

    try {
        initializeGoogleMap();

        // Auto‑load map helper modules (markers, routes, controls)
        if (window.loadMapModules) {
            debugLog('Loading map modules...');
            window.loadMapModules();
        } else {
            debugLog('loadMapModules function not found!');
        }

        // If an itinerary arrived during map‑loading, render it now
        if (window.pendingRender) {
            renderTripOnMap(window.pendingRender);
            window.pendingRender = null;
        }
    } catch (error) {
        const { showError } = window.TravelOverlays;
        showError(`Map initialization failed: ${error.message}`);
    }
};

/**
 * Fallback HTTP itinerary fetch (used when voice isn’t available)
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

    // If voice is active, let the server handle it via WebSocket
    if (isVoiceAvailable()) {
        debugLog("Processing itinerary through voice interface");
        return;
    }

    // Otherwise, call REST endpoint
    showLoading("Generating your trip itinerary!");

    try {
        const data = await fetchItinerary(city, days);
        tripData = data;
        renderTripOnMap(data);
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

    if (!window.mapModulesReady) {
        debugLog("Map modules not ready yet, storing pending render...");
        window.pendingRender = data;
        return;
    }

    debugLog("Map modules ready, rendering trip...");

    const { createAllMarkers, clearAllMarkers } = window.TravelMarkers;
    const { createAllRoutes, clearAllRoutes } = window.TravelRoutes;
    const { renderDayControls, clearDayControls } = window.TravelControls;

    if (!data.days || data.days.length === 0) {
        showError("No itinerary data to display");
        return;
    }

    clearMapElements();

    // Create markers
    const { bounds, totalStops } = createAllMarkers(data);

    // Create routes
    createAllRoutes(data);

    // Hide all days except the first one
    data.days.forEach((_, index) => {
        if (index > 0) {
            window.TravelMarkers.toggleMarkersForDay(index, false);
            window.TravelRoutes.toggleRoutesForDay(index, false);
        }
    });

    // Fit map and controls
    fitMapToBounds(bounds, totalStops);
    renderDayControls(data.days);

    debugLog("Trip rendering complete!");

    // Reset mapReady flag for next itinerary
    mapReadySent = false;
}

/**
 * Remove all map artefacts before drawing a new itinerary
 */
function clearMapElements() {
    const { debugLog } = window.TravelHelpers;

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
 * Convenience util for other modules
 */
function isVoiceAvailable() {
    return wsConnected && realtimeReady;
}

// Handle Google Maps script failures globally
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

// Public API for other modules
window.TravelApp = {
    processItinerary,
    renderTripOnMap,
    clearMapElements,
    isVoiceAvailable
};
