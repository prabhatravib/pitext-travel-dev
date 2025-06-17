// static/js/app.js – Main Application Entry Point with WebSocket & Voice Support

// Store trip data globally
let tripData = null;

// Connection state flags
let wsConnected = false;
let realtimeReady = false;
let mapReadySent = false; // ensure we only emit once per itinerary render

/**
 * Initialize the application when DOM is ready
 */
document.addEventListener("DOMContentLoaded", () => {
    const { debugLog } = window.TravelHelpers;
    debugLog("DOM loaded, setting up travel planner...");

    // Initialize core UI components
    window.TravelPanel.initializePanel();
    window.TravelForm.initializeForm();

    // Bootstrap Voice UI & Realtime Controller if available
    if (window.VoiceUI && window.RealtimeController) {
        try {
            window.VoiceUI.initialize();
            window.RealtimeController.initialize();
            debugLog('VoiceUI & RealtimeController initialized');
        } catch (err) {
            console.error('Voice initialization error:', err);
        }
    }

    // Fallback click binder for mic button
    const micBtn = document.querySelector('.voice-ui .voice-ui__button');
    if (micBtn) {
        const listeners = getEventListeners(micBtn).click || [];
        if (listeners.length === 0) {
            micBtn.addEventListener('click', async () => {
                try {
                    await window.RealtimeController.startAudioSession();
                    const bubble = document.querySelector('.voice-ui__bubble');
                    if (bubble) bubble.textContent = 'Listening…';
                } catch (e) {
                    console.error('Failed to start audio session:', e);
                }
            });
        }
    }

    // Initialize communication (WebSocket for voice or HTTP for text)
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

    if (!window.io) {
        debugLog("Socket.IO not loaded yet, retrying...");
        return setTimeout(initializeWebSocket, 500);
    }
    if (!window.RealtimeController) {
        debugLog("RealtimeController not loaded yet, deferring WebSocket init");
        return setTimeout(initializeWebSocket, 100);
    }

    try {
        const realtime = new window.RealtimeController();
        window.realtimeController = realtime;

        // Event: connected
        realtime.on('connected', () => {
            wsConnected = true;
            debugLog("WebSocket connected successfully");
        });

        // Event: ready for voice
        realtime.on('ready', () => {
            realtimeReady = true;
            debugLog("Realtime API ready for voice interaction");
            const micBtn = document.getElementById('mic-btn');
            if (micBtn) {
                micBtn.classList.add('ready');
                micBtn.title = "Voice assistant is listening...";
            }
        });

        // Event: error
        realtime.on('error', (err) => {
            errorLog("Realtime error:", err);
            if (err.critical) {
                wsConnected = false;
                realtimeReady = false;
            }
        });

        // Event: itinerary data
        realtime.on('render_itinerary', (data) => {
            debugLog("Received itinerary from voice command:", data);
            if (data.itinerary) {
                tripData = data.itinerary;
                renderTripOnMap(data.itinerary);

                // Notify backend once map is ready
                if (!mapReadySent && realtime.wsClient) {
                    realtime.wsClient.emit('map_ready', {});
                    mapReadySent = true;
                }
            }
        });

        // Open the connection
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
 * Callback once Google Maps script has loaded
 */
window.initializeApp = function () {
    const { debugLog } = window.TravelHelpers;
    const { initializeGoogleMap } = window.TravelGoogleMaps;

    debugLog('Google Maps API loaded successfully');

    try {
        initializeGoogleMap();
        if (window.loadMapModules) window.loadMapModules();
        if (window.pendingRender) {
            renderTripOnMap(window.pendingRender);
            window.pendingRender = null;
        }
    } catch (error) {
        window.TravelOverlays.showError(`Map initialization failed: ${error.message}`);
    }
};

/**
 * Fallback HTTP itinerary fetch
 */
async function processItinerary(city, days) {
    const { debugLog } = window.TravelHelpers;
    const { showLoading, showError, hideOverlay } = window.TravelOverlays;
    const { isMapLoaded } = window.TravelGoogleMaps;
    const { fetchItinerary } = window.TravelAPI;

    if (!isMapLoaded()) {
        return showError("Google Maps is still loading. Please wait a moment and try again.");
    }

    if (isVoiceAvailable()) {
        debugLog("Processing itinerary through voice interface");
        return;
    }

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
 * Render the trip on Google Maps
 */
function renderTripOnMap(data) {
    const { debugLog } = window.TravelHelpers;
    const { showError } = window.TravelOverlays;
    const { fitMapToBounds } = window.TravelGoogleMaps;

    if (!window.mapModulesReady) {
        debugLog("Map modules not ready, queuing render...");
        window.pendingRender = data;
        return;
    }

    debugLog("Rendering trip on map...");
    window.TravelMarkers.clearAllMarkers();
    window.TravelRoutes.clearAllRoutes();
    window.TravelControls.clearDayControls();

    const { bounds, totalStops } = window.TravelMarkers.createAllMarkers(data);
    window.TravelRoutes.createAllRoutes(data);
    data.days.forEach((_, idx) => {
        if (idx > 0) {
            window.TravelMarkers.toggleMarkersForDay(idx, false);
            window.TravelRoutes.toggleRoutesForDay(idx, false);
        }
    });
    fitMapToBounds(bounds, totalStops);
    window.TravelControls.renderDayControls(data.days);

    debugLog("Trip rendering complete!");
    mapReadySent = false;
}

/**
 * Is voice interface available?
 */
function isVoiceAvailable() {
    return wsConnected && realtimeReady;
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
    clearMapElements: () => {
        window.TravelMarkers.clearAllMarkers();
        window.TravelRoutes.clearAllRoutes();
        window.TravelControls.clearDayControls();
    },
    isVoiceAvailable
};
