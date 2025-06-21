// static/js/app/google-maps-init.js - Google Maps initialization callback

/**
 * This is the entry point for map-related functionality.
 */
function initMap() {
    // This function is called by the Google Maps script once it's loaded.
    const { debugLog } = window.TravelHelpers;
    debugLog("🗺️ Google Maps API ready, initializing map components...");

    // Initialize core map services
    window.TravelGoogleMaps.initializeGoogleMap();

    // CRITICAL: Now that the core API is ready, load the dependent map modules.
    // This was the missing step that caused the map to not load.
    if (window.loadMapModules) {
        window.loadMapModules();
    }
}

/**
 * Dynamically load the Google Maps API script.
 */
function loadGoogleMapsScript() {
    // Implementation of loadGoogleMapsScript function
}

window.initializeApp = function() {
    console.log('Google Maps API loaded, initializing app...');
    
    // Initialize the Google Map
    if (window.TravelGoogleMaps && window.TravelGoogleMaps.initializeGoogleMap) {
        window.TravelGoogleMaps.initializeGoogleMap();
    } else {
        console.error('TravelGoogleMaps not loaded');
    }
    
    // Load map modules after map is initialized
    if (window.loadMapModules) {
        window.loadMapModules();
    }
    
    // Fire event to notify other components
    document.dispatchEvent(new CustomEvent('googleMapsReady'));
};