// static/js/ui/voice_ui.js
// Fixed Voice UI controller with proper button management

class VoiceUIController {
    constructor() {
        this.controller = null;
        this.statusEl = document.getElementById('voice-status');
        this.statusText = document.querySelector('.status-text');
        this.micBtn = document.getElementById('mic-btn');
        this.isReady = false;
        this.isListening = false;
        this.isAssistantSpeaking = false;
        
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
    
    // Show the button - use inline style to override CSS
    this.micBtn.style.cssText = this.micBtn.style.cssText.replace('display: none', 'display: flex');
    this.micBtn.style.display = 'flex';
    
    console.log('Mic button display style:', this.micBtn.style.display);
    console.log('Mic button computed style:', window.getComputedStyle(this.micBtn).display);
    
    // Clear any existing listeners
    this.micBtn.replaceWith(this.micBtn.cloneNode(true));
    this.micBtn = document.getElementById('mic-btn');
    
    // Add click handler
    this.micBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('Mic button clicked!');
        this.toggleListening();
    });
    
    // Update button appearance
    this.updateMicButton();
    
    console.log('Mic button set up successfully');
}  
    updateMicButton() {
        if (!this.micBtn) return;
        
        // Remove all state classes
        this.micBtn.classList.remove('active', 'disabled', 'ready');
        
        if (!this.isReady) {
            this.micBtn.classList.add('disabled');
            this.micBtn.title = 'Voice not ready';
        } else if (this.isAssistantSpeaking) {
            this.micBtn.classList.add('disabled');
            this.micBtn.title = 'Assistant is speaking...';
        } else if (this.isListening) {
            this.micBtn.classList.add('active');
            this.micBtn.title = 'Click to stop listening';
        } else {
            this.micBtn.classList.add('ready');
            this.micBtn.title = 'Click to start voice chat';
        }
    }
    
    async toggleListening() {
        if (!this.isReady) {
            console.log('Voice UI not ready');
            return;
        }
        
        if (this.isAssistantSpeaking) {
            console.log('Cannot toggle - assistant is speaking');
            return;
        }
        
        if (this.isListening) {
            // Stop listening
            console.log('Stopping voice chat...');
            this.controller.disconnect();
            this.isListening = false;
            this.updateStatus('Ready - Click mic to start', 'ready');
            
            // Disable audio capture
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
                
                // Enable audio capture
                if (this.controller.audioCapture) {
                    this.controller.audioCapture.setEnabled(true);
                }
            } else {
                this.updateStatus('Connection failed - click to retry', 'error');
            }
        }
        
        this.updateMicButton();
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
                    this.updateStatus('Processing...', 'processing');
                    // Disable audio sending during processing
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
                    // Re-enable audio sending
                    if (this.controller.audioCapture && this.isListening) {
                        this.controller.audioCapture.setEnabled(true);
                    }
                    break;
            }
            
            this.updateMicButton();
        });
        
        // Handle connection events
        this.controller.on('connected', () => {
            console.log('Voice connected successfully');
        });
        
        // Handle session ready
        this.controller.on('ready', () => {
            console.log('Voice session ready');
            this.updateStatus('Listening... Speak naturally!', 'listening');
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
            this.isAssistantSpeaking = false;
            this.updateMicButton();
        });
        
        // Handle disconnection
        this.controller.on('disconnected', () => {
            console.log('Voice disconnected');
            this.isListening = false;
            this.isAssistantSpeaking = false;
            this.updateMicButton();
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
            isAssistantSpeaking: this.isAssistantSpeaking,
            controller: this.controller ? this.controller.getState() : null
        };
    }
}

// Export for global use
window.VoiceUIController = VoiceUIController;