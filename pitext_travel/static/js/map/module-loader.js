// static/js/map/module-loader.js
// Map module loader

window.mapModulesLoaded = false;
window.mapModulesReady = false;

window.loadMapModules = () => {
  if (window.mapModulesLoaded) return;
  
  // Ensure Google Maps is fully ready
  if (!window.google || !window.google.maps || !window.google.maps.marker) {
    console.log('Waiting for Google Maps API to be fully ready...');
    setTimeout(window.loadMapModules, 100);
    return;
  }

  const list = [
    '/static/js/map/markers.js',
    '/static/js/map/routes.js',
    '/static/js/map/controls.js'
  ];
  
  let done = 0;
  
  list.forEach(src => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => {
      if (++done === list.length) {
        window.mapModulesLoaded = true;
        window.mapModulesReady = true;
        console.log('[MAP] all modules loaded successfully');
        
        // Trigger any pending renders
        if (window.pendingRender) {
          console.log('[MAP] rendering pending itinerary');
          window.TravelApp.renderTripOnMap(window.pendingRender);
          window.pendingRender = null;
        }
      }
    };
    s.onerror = () => console.error('[MAP] failed to load:', src);
    document.head.appendChild(s);
  });
};