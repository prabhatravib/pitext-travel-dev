// pitext_travel/static/js/ui/voice_ui.js
// Voice UI controller that works with the existing RealtimeController

class VoiceUIController {
    constructor() {
        this.controller = null;
        this.statusEl = document.getElementById('voice-status');
        this.statusText = document.querySelector('.status-text');
        this.micBtn = document.getElementById('mic-btn');
        this.isReady = false;
        this.isListening = false;
        
        console.log('VoiceUIController initialized');
    }
    
    async initialize() {
        try {
            this.updateStatus('Initializing...', 'initializing');
            
            // Use the existing RealtimeController
            this.controller = new window.RealtimeController();
            this.setupEventHandlers();
            
            const initialized = await this.controller.initialize();
            if (!initialized) throw new Error('Failed to initialize');
            
            // Ready but not listening yet
            this.isReady = true;
            this.updateStatus('Ready - Click mic to start', 'ready');
            
            // Set up mic button
            this.setupMicButton();
            
        } catch (error) {
            console.error('Voice UI init failed:', error);
            this.updateStatus('Voice unavailable', 'error');
        }
    }
    
    setupMicButton() {
        if (!this.micBtn) {
            console.warn('Mic button not found');
            return;
        }
        
        // Show the button
        this.micBtn.style.display = 'flex';
        
        // Add click handler
        this.micBtn.addEventListener('click', () => this.toggleListening());
        
        console.log('Mic button set up');
    }
    
    async toggleListening() {
        if (!this.isReady) {
            console.log('Voice UI not ready');
            return;
        }
        
        if (this.isListening) {
            // Stop listening
            console.log('Stopping voice chat...');
            this.controller.disconnect();
            this.isListening = false;
            this.updateStatus('Ready - Click mic to start', 'ready');
            this.micBtn?.classList.remove('active');
        } else {
            // Start listening
            console.log('Starting voice chat...');
            this.updateStatus('Connecting...', 'connecting');
            
            const connected = await this.controller.connect();
            
            if (connected) {
                this.isListening = true;
                this.updateStatus('Listening... Speak naturally!', 'listening');
                this.micBtn?.classList.add('active');
            } else {
                this.updateStatus('Connection failed - click to retry', 'error');
            }
        }
    }
    
    setupEventHandlers() {
        // Handle state changes from RealtimeController
        this.controller.on('state_change', (event) => {
            console.log('Voice state change:', event.to);
            
            switch (event.to) {
                case 'LISTENING':
                    this.updateStatus('Listening to you...', 'speaking');
                    break;
                case 'PROCESSING':
                    this.updateStatus('Processing...', 'processing');
                    break;
                case 'SPEAKING':
                    this.updateStatus('Assistant speaking...', 'assistant-speaking');
                    break;
                case 'WAITING':
                    this.updateStatus('Listening... Speak naturally!', 'listening');
                    break;
            }
        });
        
        // Handle connection events
        this.controller.on('connected', () => {
            console.log('Voice connected successfully');
        });
        
        // Handle transcripts
        this.controller.on('transcript', (data) => {
            if (window.chatInstance) {
                window.chatInstance.addBubble(data.role || 'assistant', data.text);
            }
        });
        
        // Handle itinerary rendering
        this.controller.on('render_itinerary', (data) => {
            console.log('Rendering itinerary from voice:', data);
            if (window.TravelApp && data.itinerary) {
                window.TravelApp.renderTripOnMap(data.itinerary);
            }
        });
        
        // Handle errors
        this.controller.on('error', (error) => {
            console.error('Voice error:', error);
            this.updateStatus('Voice error - click to retry', 'error');
            this.isListening = false;
            this.micBtn?.classList.remove('active');
        });
        
        // Handle disconnection
        this.controller.on('disconnected', () => {
            console.log('Voice disconnected');
            this.isListening = false;
            this.micBtn?.classList.remove('active');
        });
    }
    
    updateStatus(text, className) {
        if (this.statusText) {
            this.statusText.textContent = text;
        }
        
        if (this.statusEl) {
            // Remove all state classes
            this.statusEl.classList.remove(
                'initializing', 'connecting', 'listening', 
                'speaking', 'processing', 'assistant-speaking', 
                'error', 'ready'
            );
            
            // Add new state class
            if (className) {
                this.statusEl.classList.add(className);
            }
        }
    }
    
    // Public methods for external control
    startListening() {
        if (!this.isListening) {
            this.toggleListening();
        }
    }
    
    stopListening() {
        if (this.isListening) {
            this.toggleListening();
        }
    }
    
    getState() {
        return {
            isReady: this.isReady,
            isListening: this.isListening,
            controller: this.controller ? this.controller.getState() : null
        };
    }
}

// Export for global use
window.VoiceUIController = VoiceUIController;