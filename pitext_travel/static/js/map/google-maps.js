// static/js/map/google-maps.js - Core Google Maps Initialization
// Simplified version focusing on map setup without POI functionality

(function() {
    // Day colour helper
    const DAY_COLOR_MAP = {
        1: '#FFADAD', 2: '#FFD6A5', 3: '#FDFFB6',
        4: '#FFC4E1', 5: '#FFCC99', 6: '#FFB3AB', 7: '#FFECB3'
    };
    
    function getColourForDay(dayIndex) {
        if (DAY_COLOR_MAP[dayIndex]) return DAY_COLOR_MAP[dayIndex];
        const hue = (dayIndex * 45) % 360;
        return `hsl(${hue},70%,85%)`;
    }

    // Map instance and services
    let map = null;
    let directionsService = null;
    let isGoogleMapsLoaded = false;

    /**
     * Initialize Google Maps
     */
    function initializeGoogleMap() {
        const { MAP_CONFIG, MAP_STYLES } = window.TravelConstants;
        const { debugLog } = window.TravelHelpers;
        
        const mapElement = document.getElementById('map');
        if (!mapElement) {
            console.error('Map element not found');
            return;
        }

        // Hide the loading message once map is initialized
        const loadingDiv = document.querySelector('#map .loading');
        if (loadingDiv) {
            loadingDiv.style.display = 'none';
        }

        // Create the map
        map = new google.maps.Map(mapElement, {
            center: MAP_CONFIG.DEFAULT_CENTER,
            zoom: MAP_CONFIG.DEFAULT_ZOOM,
            mapId: MAP_CONFIG.MAP_ID,
            mapTypeControl: true,
            zoomControl: true,
            scaleControl: true,
            streetViewControl: true,
            fullscreenControl: true,
            styles: MAP_STYLES
        });

        // Initialize directions service
        directionsService = new google.maps.DirectionsService();

        // Mark as loaded
        isGoogleMapsLoaded = true;

        debugLog('Google Maps initialized successfully');

        // Fire custom event
        document.dispatchEvent(new CustomEvent('mapsApiReady', {
            detail: { map: map }
        }));

        // Process any pending renders
        if (window.pendingRender) {
            debugLog('Processing pending render after map init');
            setTimeout(() => {
                if (window.TravelApp && window.TravelApp.renderTripOnMap) {
                    window.TravelApp.renderTripOnMap(window.pendingRender);
                    window.pendingRender = null;
                }
            }, 500);
        }
    }

    /**
     * Fit map bounds to show all markers
     */
    function fitMapToBounds(bounds, totalStops) {
        const { MAP_CONFIG } = window.TravelConstants;
        const { debugLog } = window.TravelHelpers;
        
        if (!map || !bounds || bounds.isEmpty() || !totalStops) {
            debugLog('Cannot fit bounds - invalid parameters');
            return;
        }

        map.fitBounds(bounds);
        
        // Adjust zoom after bounds change
        google.maps.event.addListenerOnce(map, 'bounds_changed', () => {
            const currentZoom = map.getZoom();
            
            if (currentZoom > MAP_CONFIG.MAX_ZOOM) {
                map.setZoom(MAP_CONFIG.COMFORTABLE_ZOOM);
            } else if (currentZoom < MAP_CONFIG.MIN_ZOOM) {
                map.setZoom(MAP_CONFIG.OVERVIEW_ZOOM);
            }
        });
    }

    /**
     * Set map center and zoom
     */
    function setMapView(center, zoom) {
        if (!map) return;
        
        if (center) {
            map.setCenter(center);
        }
        if (zoom) {
            map.setZoom(zoom);
        }
    }

    /**
     * Get current map bounds
     */
    function getMapBounds() {
        return map ? map.getBounds() : null;
    }

    /**
     * Add a map listener
     */
    function addMapListener(event, callback) {
        if (!map) return null;
        return map.addListener(event, callback);
    }

    // Export public API
    window.TravelGoogleMaps = {
        initializeGoogleMap,
        getMap: () => map,
        getDirectionsService: () => directionsService,
        isMapLoaded: () => isGoogleMapsLoaded,
        fitMapToBounds,
        setMapView,
        getMapBounds,
        addMapListener,
        // Reference the function from constants instead
        getColourForDay: window.TravelConstants.getColourForDay
    };
})();