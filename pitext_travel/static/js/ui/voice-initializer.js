// static/js/ui/voice-initializer.js
// Voice UI initialization

document.addEventListener('DOMContentLoaded', () => {
  // Give some time for all modules to load
  setTimeout(() => {
    console.log('Initializing unified voice UI...');
    
    if (window.VoiceUI && window.RealtimeController) {
      try {
        window.voiceUI = new VoiceUI();
        window.voiceUI.initialize().then(success => {
          if (success) {
            console.log('✅ Unified voice UI ready');
            
            // Set up additional integration between voice and map
            if (window.voiceUI.controller) {
              window.voiceUI.controller.on('render_itinerary', (data) => {
                console.log('🗺️ Voice triggered map render:', data);
                if (data.itinerary && window.TravelApp) {
                  window.TravelApp.renderTripOnMap(data.itinerary);
                }
              });
            }
          } else {
            console.error('❌ Voice UI failed to initialize');
            const btn = document.getElementById('voice-button');
            if (btn) {
              btn.style.display = 'none';
              console.log('Voice button hidden due to initialization failure');
            }
          }
        });
      } catch (err) {
        console.error('Voice initialization error:', err);
        const btn = document.getElementById('voice-button');
        if (btn) btn.style.display = 'none';
      }
    } else {
      console.error('Required voice components not loaded');
      const btn = document.getElementById('voice-button');
      if (btn) btn.style.display = 'none';
    }
  }, 1500); // Increased delay to ensure all modules are loaded
});