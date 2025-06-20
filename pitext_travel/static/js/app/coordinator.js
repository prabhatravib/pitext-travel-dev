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

        if (!isMapLoaded()) {
            return showError("Google Maps is still loading. Please wait a moment and try again.");
        }

        if (this.isVoiceAvailable()) {
            debugLog("Voice is available - user should use voice interface instead");
            return;
        }

        showLoading("Generating your trip itinerary!");
        
        try {
            const data = await fetchItinerary(city, days);
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