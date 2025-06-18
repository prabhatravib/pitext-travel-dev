// static/js/map/google-maps.js
// -------------------------------------------------------------
//  PiText Travel – Google-Maps bootstrap + "always-on" attractions
//  (with dynamic clusterer detection at use-time)
// -------------------------------------------------------------

/* ----------  DAY-COLOUR HELPER  ---------- */
const DAY_COLOR_MAP = {
  1: '#FFADAD', 2: '#FFD6A5', 3: '#FDFFB6',
  4: '#FFC4E1', 5: '#FFCC99', 6: '#FFB3AB', 7: '#FFECB3'
};
function getColourForDay(dayIndex) {
  if (DAY_COLOR_MAP[dayIndex]) return DAY_COLOR_MAP[dayIndex];
  const hue = (dayIndex * 45) % 360;
  return `hsl(${hue},70%,85%)`;
}

/* ----------  MAP / SERVICES  ---------- */
let map, directionsService, isGoogleMapsLoaded = false;

/* ----------  CLUSTERER DETECTION  ---------- */
/** 
 * At runtime, pick up whichever clusterer is loaded:
 *  - window.MarkerClusterer   (legacy)
 *  - google.maps.markerclusterer.MarkerClusterer (@googlemaps/markerclusterer)
 */
function getClustererCtor() {
  if (window.MarkerClusterer) {
    return window.MarkerClusterer;
  }
  if (window.google
      && google.maps.markerclusterer
      && google.maps.markerclusterer.MarkerClusterer) {
    return google.maps.markerclusterer.MarkerClusterer;
  }
  return null;
}

/* ----------  TOURIST POI MARKERS  ---------- */
let poiMarkers   = [];      // google.maps.Marker[]
let poiClusterer = null;
const CLUSTER_OPTIONS = {
  imagePath : 'https://developers.google.com/maps/documentation/javascript/examples/markerclusterer/m',
  maxZoom   : 11,   //  ≤ 11  → cluster   |   ≥ 12  → no cluster,   // ⬅️  stop clustering at zoom 13+
  // Optional fine-tuning ↓
  gridSize  : 50,   // cluster radius in px (smaller ⇒ fewer clusters)
  minimumClusterSize : 4   // don't collapse 2-or-3 markers anymore
};

/** remove existing markers & clusters */
function clearPoiMarkers() {
  if (poiClusterer) poiClusterer.clearMarkers();
  poiMarkers.forEach(m => m.setMap(null));
  poiMarkers = [];
}

/* ----------  TOURIST POI FETCHER  ---------- */
const TOURIST_TYPES = [
  'tourist_attraction','museum','art_gallery','church','hindu_temple','synagogue',
  'mosque','place_of_worship','park','zoo','aquarium','stadium','casino',
  'amusement_park','campground','cemetery','library','city_hall','rv_park',
  'university','point_of_interest'
];
const poiCache = new Map(); // key=`${type}_${lat}_${lng}_${zoom}`

function splitBounds(bounds, segments = 3) {
  const ne = bounds.getNorthEast(), sw = bounds.getSouthWest();
  const latStep = (ne.lat() - sw.lat()) / segments;
  const lngStep = (ne.lng() - sw.lng()) / segments;
  const tiles = [];
  for (let r = 0; r < segments; r++) {
    for (let c = 0; c < segments; c++) {
      const tileSw = new google.maps.LatLng(
        sw.lat() + r * latStep, sw.lng() + c * lngStep
      );
      const tileNe = new google.maps.LatLng(
        sw.lat() + (r + 1) * latStep, sw.lng() + (c + 1) * lngStep
      );
      tiles.push(new google.maps.LatLngBounds(tileSw, tileNe));
    }
  }
  return tiles;
}

function fetchTouristPois() {
  if (!map) return;
  clearPoiMarkers();

  const svc   = new google.maps.places.PlacesService(map);
  const zoom  = map.getZoom();
  const tiles = (zoom <= 14)
    ? splitBounds(map.getBounds(), 3)
    : [map.getBounds()];

  tiles.forEach(bounds => {
    TOURIST_TYPES.forEach(type => {
      const key = `${type}_${bounds.getCenter().lat().toFixed(3)}_${bounds.getCenter().lng().toFixed(3)}_${zoom}`;
      if (poiCache.has(key)) {
        poiMarkers.push(...poiCache.get(key));
        return;
      }
      svc.nearbySearch({ bounds, type }, (results, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !results) return;

        const fresh = results.map(place => {
          const iconUrl = place.icon
            || 'https://maps.gstatic.com/mapfiles/place_api/icons/v1/png_71/generic_business-71.png';
          return new google.maps.Marker({
            position: place.geometry.location,
            icon:     { url: iconUrl, scaledSize: new google.maps.Size(22, 22) },
            title:    place.name,
            map
          });
        });

        poiMarkers.push(...fresh);
        poiCache.set(key, fresh);
        if (poiClusterer) poiClusterer.repaint();
      });
    });
  });

  // now cluster, if a clusterer is loaded
  const ClusterCtor = getClustererCtor();
  if (ClusterCtor) {
    if (!poiClusterer) {
      poiClusterer = new ClusterCtor(map, poiMarkers, CLUSTER_OPTIONS);
    } else {
      poiClusterer.clearMarkers();
      poiClusterer.addMarkers(poiMarkers, /* noDraw= */ true);
    }
  }
}

/* ----------  DEBOUNCE  ---------- */
function debounce(fn, ms = 400) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
const debouncedFetchPois = debounce(fetchTouristPois, 500);

/* ----------  MAIN INITIALIZATION  ---------- */
function initializeGoogleMap() {
  const { MAP_CONFIG, MAP_STYLES } = window.TravelConstants;
  const el = document.getElementById('map');
  
// Hide the loading message once map is initialized
const loadingDiv = document.querySelector('#map .loading');
if (loadingDiv) {
    loadingDiv.style.display = 'none';
}

// Trigger any pending voice renders
setTimeout(() => {
    if (window.pendingRender) {
        console.log('Processing pending voice render after map init');
        if (window.TravelApp && window.TravelApp.renderTripOnMap) {
            window.TravelApp.renderTripOnMap(window.pendingRender);
            window.pendingRender = null;
        }
    }
}, 500);
// Create the map
map = new google.maps.Map(el, {
  center: MAP_CONFIG.DEFAULT_CENTER,
  zoom: MAP_CONFIG.DEFAULT_ZOOM,
  mapId: MAP_CONFIG.MAP_ID,
  mapTypeControl: true,
  zoomControl: true,
  scaleControl: true,
  streetViewControl: true,
  fullscreenControl: true,
  styles: MAP_STYLES  // Use styles from constants
});  
  // Initialize directions service
  directionsService = new google.maps.DirectionsService();
  
  // Set up event listeners for POI loading
  //map.addListener('bounds_changed', debouncedFetchPois);
 // map.addListener('zoom_changed', debouncedFetchPois);
  
  // Load initial POIs
 // google.maps.event.addListenerOnce(map, 'idle', fetchTouristPois);
  
  // Mark as loaded
  isGoogleMapsLoaded = true;

  
  console.log('Google Maps initialized successfully');
}

/* ----------  FIT BOUNDS  ---------- */
function fitMapToBounds(bounds, totalStops) {
  const { MAP_CONFIG } = window.TravelConstants;
  if (!bounds.isEmpty() && totalStops) {
    map.fitBounds(bounds);
    google.maps.event.addListenerOnce(map, 'bounds_changed', () => {
      const z = map.getZoom();
      if (z > MAP_CONFIG.MAX_ZOOM)     map.setZoom(MAP_CONFIG.COMFORTABLE_ZOOM);
      else if (z < MAP_CONFIG.MIN_ZOOM) map.setZoom(MAP_CONFIG.OVERVIEW_ZOOM);
    });
  } else {
    map.setCenter(MAP_CONFIG.DEFAULT_CENTER);
    map.setZoom(  MAP_CONFIG.DEFAULT_ZOOM);
  }
}

/* ----------  EXPORT  ---------- */
window.TravelGoogleMaps = {
  initializeGoogleMap,
  getMap:               () => map,
  getDirectionsService: () => directionsService,
  isMapLoaded:          () => isGoogleMapsLoaded,
  fitMapToBounds,
  getColourForDay,
  fetchTouristPois  
};