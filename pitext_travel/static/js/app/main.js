// static/js/app/main.js - Main Application Entry Point (Minimal)

// Global state that was in app.js
window.tripData = null;
window.wsConnected = false;
window.realtimeReady = false;
window.mapReadySent = false;

/**
 * Initialize the application when DOM is ready
 */
document.addEventListener("DOMContentLoaded", () => {
    const { debugLog } = window.TravelHelpers;
    debugLog("DOM loaded, initializing travel planner...");

    // Initialize the application
    if (window.TravelInitializer) {
        window.TravelInitializer.initialize();
    } else {
        console.error("TravelInitializer not loaded");
    }
});