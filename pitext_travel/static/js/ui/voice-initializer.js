// static/js/ui/voice-initializer.js
// Voice UI initialization

// Global initialization tracking
window.VoiceInitialization = window.VoiceInitialization || {
    initialized: false,
    initializing: false,
    promise: null
};

document.addEventListener('DOMContentLoaded', () => {
  // Give some time for all modules to load
  setTimeout(() => {
    console.log('Initializing unified voice UI...');
    
    // Prevent multiple initialization attempts
    if (window.VoiceInitialization.initialized || window.VoiceInitialization.initializing) {
      console.log('Voice UI already initialized or initializing, skipping...');
      return;
    }
    
    if (window.VoiceUI && window.RealtimeController) {
      try {
        window.VoiceInitialization.initializing = true;
        
        // Use singleton pattern - get existing instance or create new one
        if (!window.voiceUI) {
          window.voiceUI = new VoiceUI();
        }
        
        // Only initialize if not already initialized
        if (!window.voiceUI.initialized && !window.voiceUI.initializationPromise) {
          window.VoiceInitialization.promise = window.voiceUI.initialize().then(success => {
            if (success) {
              console.log('✅ Unified voice UI ready');
              window.voiceUI.initialized = true;
              window.VoiceInitialization.initialized = true;
              
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
            window.VoiceInitialization.initializing = false;
            return success;
          });
        } else {
          console.log('Voice UI already initialized or initializing');
          window.VoiceInitialization.initializing = false;
        }
      } catch (err) {
        console.error('Voice initialization error:', err);
        window.VoiceInitialization.initializing = false;
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