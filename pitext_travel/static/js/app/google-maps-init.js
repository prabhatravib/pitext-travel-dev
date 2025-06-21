// static/js/app/google-maps-init.js - Google Maps initialization callback

/**
 * Dynamically load the Google Maps API script.
 */
async function loadGoogleMapsScript() {
    const { debugLog, errorLog } = window.TravelHelpers;
    debugLog('Starting Google Maps script loading process...');
    try {
        const config = await window.TravelConfig.loadGoogleMapsConfig();
        const scriptUrl = window.TravelConfig.createMapsScriptUrl(config);
        await window.TravelConfig.loadGoogleMapsScript(scriptUrl);
        debugLog('Google Maps script loaded successfully and callback will be triggered.');
    } catch (error) {
        errorLog('Failed to load Google Maps script:', error);
        // Display a user-friendly error on the map div
        const mapDiv = document.getElementById('map');
        if (mapDiv) {
            mapDiv.innerHTML = '<div class="error">Could not load Google Maps. Please check your API key and network connection.</div>';
        }
    }
}

window.initializeApp = function() {
    const { debugLog } = window.TravelHelpers;
    debugLog("🗺️ Google Maps API ready, initializing map components...");
    
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

// Start the loading process
loadGoogleMapsScript();