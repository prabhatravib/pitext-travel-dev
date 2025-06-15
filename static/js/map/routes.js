// static/js/map/routes.js
// -------------------------------------------------------------
//  • Draws a walking route (Directions API) or, if that fails,
//    a simple geodesic Polyline for each day.
//  • Keeps a per-day colour in sync with marker colours.
//  • Adds drawRoute(encodedPolyline[, day]) so voice-chat
//    can drop a ready-made route on the map in one call.
// -------------------------------------------------------------

(function() {
    if (!window.google || !window.google.maps) {
        console.error('Google Maps API not fully loaded yet for routes.js - retrying...');
        setTimeout(function() {
            const script = document.createElement('script');
            script.src = '/static/js/map/routes.js';
            document.head.appendChild(script);
        }, 100);
        return;
    }

// ---------- internal state ----------

// collection of DirectionsRenderers *and* fallback Polylines
let currentPaths = [];

/** Return the same colour the markers use for this day (0-based index). */
function getRouteColour(dayIndex) {
  return window.TravelGoogleMaps.getColourForDay(dayIndex + 1);
}

// ---------- main “create all” entry point ----------

/**
 * Build routes for every day in a trip data object.
 * tripData = { days:[ {label, stops:[{name,lat,lng}, …]}, … ] }
 */
function createAllRoutes(tripData) {
  const { debugLog } = window.TravelHelpers;

  debugLog('Creating routes for all days …');
  clearAllRoutes();

  tripData.days.forEach((day, dayIndex) => {
    if (Array.isArray(day.stops) && day.stops.length > 1) {
      createDayRoute(day, dayIndex);
    }
  });
}

// ---------- one-day route builder ----------

function createDayRoute(day, dayIndex) {
  const {
    debugLog,
    isValidCoordinate,
    createLatLng
  } = window.TravelHelpers;
  const {
    getMap,
    getDirectionsService
  } = window.TravelGoogleMaps;
  const { TRAVEL_MODE } = window.TravelConstants;
  const { isDayVisible } = window.TravelControls;

  debugLog(`Creating route for Day ${dayIndex + 1} (“${day.label || ''}”)`);

  const validStops = (day.stops || []).filter(s =>
    isValidCoordinate(s.lat, s.lng)
  );
  if (validStops.length < 2) {
    debugLog(`  Day ${dayIndex + 1} has <2 valid stops → no route.`);
    return;
  }

  // Directions-API request
  const origin      = createLatLng(validStops[0].lat, validStops[0].lng);
  const destination = createLatLng(
    validStops[validStops.length - 1].lat,
    validStops[validStops.length - 1].lng
  );
  const waypoints = validStops.slice(1, -1).map(s => ({
    location: createLatLng(s.lat, s.lng),
    stopover: true
  }));

  const request = {
    origin,
    destination,
    waypoints,
    travelMode: TRAVEL_MODE.WALKING,
    optimizeWaypoints: false,
    avoidHighways: true,
    avoidTolls: true
  };

  const directionsService = getDirectionsService();
  const map          = getMap();
  const routeColour  = getRouteColour(dayIndex);

  directionsService.route(request, (result, status) => {
    debugLog(
      `  Directions API response for Day ${dayIndex + 1}: ${status}`
    );

    if (status === 'OK' && result) {
      // use DirectionsRenderer
      const renderer = new google.maps.DirectionsRenderer({
        suppressMarkers: true,
        polylineOptions: {
          strokeColor: routeColour,
          strokeWeight: 4,
          strokeOpacity: 0.8
        },
        suppressInfoWindows: true
      });

      renderer.setDirections(result);
      renderer.dayIndex = dayIndex;
      renderer.setMap(isDayVisible(dayIndex) ? map : null);

      currentPaths.push(renderer);
    } else {
      // fallback
      debugLog(
        `  Directions failed (${status}); using fallback polyline.`
      );
      createSimplePolyline(validStops, dayIndex);
    }
  });
}

// ---------- fallback polyline ----------

function createSimplePolyline(stops, dayIndex) {
  const { debugLog, createLatLng } = window.TravelHelpers;
  const { getMap }                 = window.TravelGoogleMaps;
  const { isDayVisible }           = window.TravelControls;

  debugLog(`  Drawing fallback polyline for Day ${dayIndex + 1}`);

  const pathCoords  = stops.map(s => createLatLng(s.lat, s.lng));
  const routeColour = getRouteColour(dayIndex);
  const map         = getMap();

  const polyline = new google.maps.Polyline({
    path: pathCoords,
    geodesic: true,
    strokeColor: routeColour,
    strokeOpacity: 0.8,
    strokeWeight: 4
  });

  polyline.dayIndex = dayIndex;
  polyline.setMap(isDayVisible(dayIndex) ? map : null);

  currentPaths.push(polyline);
}

// ---------- utilities ----------

function clearAllRoutes() {
  currentPaths.forEach(p => p.setMap?.(null));
  currentPaths = [];
}

function toggleRoutesForDay(dayIndex, visible) {
  const { debugLog } = window.TravelHelpers;
  const { getMap }   = window.TravelGoogleMaps;

  debugLog(
    `Toggling routes for Day ${dayIndex + 1} → ${visible ? 'show' : 'hide'}`
  );

  currentPaths.forEach(p => {
    if (p.dayIndex === dayIndex) {
      p.setMap(visible ? getMap() : null);
    }
  });
}

// ---------- “voice chat” helper ----------
//
// drawRoute(encodedPolyline[, dayIndex = 0])
// ------------------------------------------------
// Called by chat.js when the back-end returns an
// already-computed polyline.

const dayLayers = []; // one Polyline per day

function drawRoute(encoded, day = 0) {
  const map = window.TravelGoogleMaps.getMap();

  // remove old layer for that day, if any
  if (dayLayers[day]) dayLayers[day].setMap(null);

  const path = google.maps.geometry.encoding.decodePath(encoded);
  const line = new google.maps.Polyline({
    path,
    strokeOpacity: 0.9,
    strokeWeight: 4,
    geodesic: true,
    map
  });

  dayLayers[day] = line;

  // fit viewport
  const bounds = new google.maps.LatLngBounds();
  path.forEach(p => bounds.extend(p));
  map.fitBounds(bounds, 80);
}

// ---------- export to global namespace ----------

window.TravelRoutes = {
  createAllRoutes,
  createDayRoute,
  clearAllRoutes,
  toggleRoutesForDay
};

// Make the quick helper globally reachable (e.g. from chat.js)
window.drawRoute = drawRoute;
})();