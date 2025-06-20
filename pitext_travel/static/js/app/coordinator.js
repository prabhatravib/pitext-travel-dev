// static/js/app/coordinator.js - Application Coordination Functions
// Extracted from app.js - handles coordination between features

const TravelCoordinator = {
    /**
     * Process itinerary (HTTP-based fallback)
     * Moved from app.js processItinerary function
     */
    async processItinerary(city, days) {
        const { debugLog, errorLog } = window.TravelHelpers;
        const { showLoading, showError, hideOverlay } = window.TravelOverlays;
        const { isMapLoaded } = window.TravelGoogleMaps;
        const { fetchItinerary } = window.TravelAPI;

        debugLog("🚀 processItinerary called with:", { city, days });

        if (!isMapLoaded()) {
            debugLog("❌ Map not loaded yet");
            return showError("Google Maps is still loading. Please wait a moment and try again.");
        }

        if (this.isVoiceAvailable()) {
            debugLog("Voice is available - user should use voice interface instead");
            return;
        }

        debugLog("✅ Starting HTTP-based itinerary generation");
        showLoading("Generating your trip itinerary!");
        
        try {
            debugLog("📡 Fetching itinerary from API...");
            const data = await fetchItinerary(city, days);
            debugLog("📡 Received itinerary data:", data);
            
            window.tripData = data;
            this.renderTripOnMap(data);
            hideOverlay();
        } catch (error) {
            errorLog("Failed to process itinerary:", error);
            showError(`Failed to load itinerary: ${error.message}`);
        }
    },

    /**
     * Render the trip on Google Maps
     * Moved from app.js renderTripOnMap function
     */
    renderTripOnMap(data) {
        const { debugLog, errorLog } = window.TravelHelpers;
        const { showError } = window.TravelOverlays;
        const { fitMapToBounds } = window.TravelGoogleMaps;

        debugLog("🗺️ renderTripOnMap called with data:", data);

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
            debugLog("TravelMarkers:", !!window.TravelMarkers);
            debugLog("TravelRoutes:", !!window.TravelRoutes);
            debugLog("TravelControls:", !!window.TravelControls);
            showError("Map modules not loaded properly");
            return;
        }

        debugLog("🗺️ Rendering trip on map with", data.days.length, "days");

        try {
            // Clear existing elements first
            window.TravelMarkers.clearAllMarkers();
            window.TravelRoutes.clearAllRoutes();
            window.TravelControls.clearDayControls();

            // IMPORTANT: Render controls first to initialize visibility state.
            // This ensures that when markers/routes are created, they know
            // whether they should be visible from the start.
            window.TravelControls.renderDayControls(data.days);

            // Create markers and get map bounds. The visibility is handled
            // inside createMarker using the now-initialized control state.
            const { bounds, totalStops } = window.TravelMarkers.createAllMarkers(data);
            debugLog("Created markers for", totalStops, "total stops");

            // Create routes for all days. Visibility is handled inside.
            window.TravelRoutes.createAllRoutes(data);
            debugLog("Created routes for all days");

            // Fit map to the bounds of all created markers
            fitMapToBounds(bounds, totalStops);

            debugLog("✅ Trip rendering complete!");
            
            // Reset map ready flag for next rendering
            window.mapReadySent = false;
            
        } catch (error) {
            errorLog("Error rendering trip:", error);
            showError(`Failed to render trip: ${error.message}`);
        }
    },

    /**
     * Clear all map elements
     * Moved from app.js clearMapElements function
     */
    clearMapElements() {
        if (window.TravelMarkers) window.TravelMarkers.clearAllMarkers();
        if (window.TravelRoutes) window.TravelRoutes.clearAllRoutes();
        if (window.TravelControls) window.TravelControls.clearDayControls();
    },

    /**
     * Is voice interface available?
     * Moved from app.js isVoiceAvailable function
     */
    isVoiceAvailable() {
        return window.wsConnected && window.realtimeReady && window.voiceUI && window.voiceUI.isReady;
    }
};

// Expose public API (maintain compatibility with existing code)
window.TravelApp = window.TravelApp || {};
Object.assign(window.TravelApp, {
    processItinerary: (city, days) => TravelCoordinator.processItinerary(city, days),
    renderTripOnMap: (data) => TravelCoordinator.renderTripOnMap(data),
    clearMapElements: () => TravelCoordinator.clearMapElements(),
    isVoiceAvailable: () => TravelCoordinator.isVoiceAvailable()
});

// Export for internal use
window.TravelCoordinator = TravelCoordinator;