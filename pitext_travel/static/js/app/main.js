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

    // This is the primary entry point for the application.
    // It begins the process of loading the Google Maps API.
    // The `initMap` function in `google-maps-init.js` will be
    // used as the callback, ensuring a proper, sequential startup.
    if (window.TravelGoogleMapsInit && window.TravelGoogleMapsInit.loadGoogleMapsAPI) {
        window.TravelGoogleMapsInit.loadGoogleMapsAPI();
    } else {
        console.error("Google Maps Initializer not found.");
    }
});