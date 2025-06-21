// static/js/app/main.js - Application entry point

// Global state that was in app.js
window.tripData = null;
window.wsConnected = false;
window.realtimeReady = false;
window.mapReadySent = false;

/**
 * Initialize the application when DOM is ready
 */
document.addEventListener("DOMContentLoaded", () => {
    // This log confirms that our main script is running.
    console.log("DOM fully loaded and parsed");

    // Initialize the application using TravelInitializer
    if (window.TravelInitializer) {
        window.TravelInitializer.initialize();
    } else {
        console.error("TravelInitializer not found.");
    }
});