// static/js/utils/constants.js – Shared constants (vector-map ready)
// -----------------------------------------------------------------

// 1) Map configuration
const MAP_CONFIG = {
  DEFAULT_CENTER   : { lat: 48.8566, lng: 2.3522 },
  DEFAULT_ZOOM     : 13,
  MAX_ZOOM         : 16,
  MIN_ZOOM         : 10,
  COMFORTABLE_ZOOM : 14,
  OVERVIEW_ZOOM    : 12,
  
  // Comment out or remove the MAP_ID
  MAP_ID: 'c3bdabd61cc122adbb5aee9d'
};

// 2) Travel mode
const TRAVEL_MODE = { WALKING: 'WALKING' };

// 3) UI colours
const COLORS = {
  DEFAULT_ROUTE : '#4285f4',
  DAY_COLORS    : [
    '#ff6b6b', '#4ecdc4', '#45b7d1',
    '#96ceb4', '#feca57', '#ff9ff3', '#54a0ff'
  ]
};

// 4) API endpoints
const API_ENDPOINTS = {
  CONFIG   : '/travel/api/config',
  ITINERARY: '/travel/api/itinerary'
};

// 5) Comprehensive map styles - hide only road labels, keep everything else
const MAP_STYLES = [
  /* ----- POI visibility ----- */
  // Hide ALL POI text labels
  {
    featureType: 'poi',
    elementType: 'labels.text',
    stylers: [{ visibility: 'off' }]
  },
  // Show POI icons (museums, parks, attractions, etc.)
  {
    featureType: 'poi',
    elementType: 'labels.icon',
    stylers: [{ visibility: 'on' }]
  },
  // … except for generic businesses, which we still hide:
  {
    featureType: 'poi.business',
    elementType: 'labels.icon',
    stylers: [{ visibility: 'off' }]
  },

  /* ----- Road / transit / neighbourhood clutter ----- */
  { featureType: 'road.local',           elementType: 'labels',       stylers: [{ visibility: 'off' }] },
  { featureType: 'road.arterial',        elementType: 'labels.text',  stylers: [{ visibility: 'off' }] },
  { featureType: 'road.highway',         elementType: 'labels.icon',  stylers: [{ visibility: 'off' }] },
  { featureType: 'road.arterial',        elementType: 'labels.icon',  stylers: [{ visibility: 'off' }] },
  { featureType: 'road.local',           elementType: 'labels.icon',  stylers: [{ visibility: 'off' }] },
  { featureType: 'transit',              elementType: 'labels',       stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.neighborhood', elementType: 'labels', stylers: [{ visibility: 'off' }] },

  /* ----- Subtle visual tweaks ----- */
  { elementType: 'labels.text.fill',   stylers: [{ lightness: 35 }] },
  { elementType: 'labels.text.stroke', stylers: [{ visibility: 'on' }, { lightness: 65 }] },
  { elementType: 'geometry',           stylers: [{ lightness: 10 }] }
];
// 6) Export everything
window.TravelConstants = {
  MAP_CONFIG,
  TRAVEL_MODE,
  COLORS,
  API_ENDPOINTS,
  MAP_STYLES
};
