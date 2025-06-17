// static/js/ui/voice_ui.js
// Unified Voice UI controller combining button and status functionality

class VoiceUI {
    constructor() {
        this.controller = null;
        this.buttonEl = document.getElementById('voice-button');
        this.statusText = document.querySelector('.status-text');
        this.voiceCircle = document.querySelector('.voice-circle');
        
        this.isReady = false;
        this.isListening = false;
        this.isAssistantSpeaking = false;
        
        console.log('VoiceUI initialized');
    }
    
    async initialize() {
        if (!this.buttonEl) {
            console.warn('Voice button element not found');
            return false;
        }
        
        try {
            this.updateStatus('Requesting microphone...', 'initializing');
            
            // Initialize the realtime controller
            this.controller = new window.RealtimeController();
            this.setupEventHandlers();
            
            const initialized = await this.controller.initialize();
            if (!initialized) {
                throw new Error('Failed to initialize audio components');
            }
            
            this.setupClickHandler();
            this.isReady = true;
            this.updateStatus('Ready - Click to start voice chat', 'ready');
            
            console.log('VoiceUI initialized successfully');
            return true;
            
        } catch (error) {
            console.error('Voice UI initialization failed:', error);
            this.updateStatus('Voice unavailable - Check microphone', 'error');
            return false;
        }
    }
    
    setupClickHandler() {
        if (!this.buttonEl) return;
        
        this.buttonEl.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (!this.isReady || this.isAssistantSpeaking) {
                console.log('Click ignored - not ready or assistant speaking');
                return;
            }
            
            await this.toggleListening();
        });
        
        console.log('Click handler set up');
    }
    
    async toggleListening() {
        if (this.isListening) {
            // Stop listening
            console.log('Stopping voice chat...');
            this.controller.disconnect();
            this.isListening = false;
            this.updateStatus('Ready - Click to start voice chat', 'ready');
            
            if (this.controller.audioCapture) {
                this.controller.audioCapture.setEnabled(false);
            }
        } else {
            // Start listening
            console.log('Starting voice chat...');
            this.updateStatus('Connecting...', 'connecting');
            
            const connected = await this.controller.connect();
            
            if (connected) {
                this.isListening = true;
                this.updateStatus('Listening... Speak naturally!', 'listening');
                
                if (this.controller.audioCapture) {
                    this.controller.audioCapture.setEnabled(true);
                }
            } else {
                this.updateStatus('Connection failed - Click to retry', 'error');
            }
        }
        
        this.updateButtonState();
    }
    
    setupEventHandlers() {
        // Handle state changes from RealtimeController
        this.controller.on('state_change', (event) => {
            console.log('Voice state change:', event.to);
            
            switch (event.to) {
                case 'LISTENING':
                    this.updateStatus('Listening to you...', 'speaking');
                    this.isAssistantSpeaking = false;
                    break;
                case 'PROCESSING':
                    this.updateStatus('Processing your request...', 'processing');
                    if (this.controller.audioCapture) {
                        this.controller.audioCapture.setEnabled(false);
                    }
                    break;
                case 'SPEAKING':
                    this.updateStatus('Assistant speaking...', 'assistant-speaking');
                    this.isAssistantSpeaking = true;
                    break;
                case 'WAITING':
                    this.updateStatus('Listening... Speak naturally!', 'listening');
                    this.isAssistantSpeaking = false;
                    if (this.controller.audioCapture && this.isListening) {
                        this.controller.audioCapture.setEnabled(true);
                    }
                    break;
            }
            
            this.updateButtonState();
        });
        
        // Handle connection events
        this.controller.on('connected', () => {
            console.log('Voice connected successfully');
        });
        
        this.controller.on('ready', () => {
            console.log('Voice session ready');
            this.updateStatus('Listening... Speak naturally!', 'listening');
        });
        
        // Handle transcripts for chat display
// Handle transcripts for chat display
// Handle transcripts for chat display
        this.controller.on('transcript', (data) => {
            if (window.chatInstance) {
                window.chatInstance.updateTranscript(data);
            }
        });        // Handle itinerary rendering
        this.controller.on('render_itinerary', (data) => {
            console.log('Rendering itinerary from voice:', data);
            if (window.TravelApp && data.itinerary) {
                window.TravelApp.renderTripOnMap(data.itinerary);
            }
        });
        
        // Handle errors
        this.controller.on('error', (error) => {
            console.error('Voice error:', error);
            this.updateStatus('Voice error - Click to retry', 'error');
            this.isListening = false;
            this.isAssistantSpeaking = false;
            this.updateButtonState();
        });
        
        // Handle disconnection
        this.controller.on('disconnected', () => {
            console.log('Voice disconnected');
            this.isListening = false;
            this.isAssistantSpeaking = false;
            this.updateButtonState();
        });
    }
    
    updateStatus(text, className) {
        if (this.statusText) {
            this.statusText.textContent = text;
        }
        
        if (this.buttonEl) {
            // Remove all state classes
            this.buttonEl.classList.remove(
                'initializing', 'connecting', 'listening', 
                'speaking', 'processing', 'assistant-speaking', 
                'error', 'ready', 'disabled'
            );
            
            // Add new state class
            if (className) {
                this.buttonEl.classList.add(className);
            }
        }
        
        // Update title attribute
        if (this.buttonEl) {
            this.buttonEl.title = text;
        }
    }
    
    updateButtonState() {
        if (!this.buttonEl) return;
        
        // Handle disabled state
        if (!this.isReady || this.isAssistantSpeaking) {
            this.buttonEl.classList.add('disabled');
        } else {
            this.buttonEl.classList.remove('disabled');
        }
    }
    
    // Public API methods
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
            isAssistantSpeaking: this.isAssistantSpeaking,
            controller: this.controller ? this.controller.getState() : null
        };
    }
}

// Export for global use
window.VoiceUI = VoiceUI;