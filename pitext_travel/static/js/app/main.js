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
    // This log confirms that our main script is running.
    console.log("DOM fully loaded and parsed");

    // All initialization logic is now handled by the callback
    // in `google-maps-init.js`. The `initMap` function will be
    // called automatically by the Google Maps script, so we no
    // longer need to call it manually from here.
});