// VAD-based continuous voice interaction
class ContinuousVoiceChat {
    constructor() {
        this.controller = null;
        this.statusEl = document.getElementById('voice-status');
        this.statusText = document.querySelector('.status-text');
        this.isReady = false;
        
        // Auto-initialize on page load
        this.initialize();
    }
    
    async initialize() {
        try {
            // Update status
            this.updateStatus('Requesting microphone...', 'initializing');
            
            // Create and initialize the realtime controller
            this.controller = new window.RealtimeController();
            
            // Set up event handlers
            this.setupEventHandlers();
            
            // Initialize and connect
            const initialized = await this.controller.initialize();
            if (!initialized) {
                throw new Error('Failed to initialize audio components');
            }
            
            this.updateStatus('Connecting...', 'connecting');
            
            const connected = await this.controller.connect();
            if (!connected) {
                throw new Error('Failed to connect to voice service');
            }
            
            this.isReady = true;
            this.updateStatus('Listening... Just speak naturally!', 'listening');
            
            console.log('Continuous voice chat initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize voice chat:', error);
            this.updateStatus('Voice unavailable', 'error');
        }
    }
    
    setupEventHandlers() {
        // Handle state changes
        this.controller.on('state_change', (event) => {
            console.log('Voice state:', event.to);
            
            switch (event.to) {
                case 'LISTENING':
                    this.updateStatus('Listening...', 'listening');
                    break;
                case 'PROCESSING':
                    this.updateStatus('Processing...', 'processing');
                    break;
                case 'SPEAKING':
                    this.updateStatus('Assistant speaking...', 'assistant-speaking');
                    break;
                case 'WAITING':
                    this.updateStatus('Listening... Just speak naturally!', 'listening');
                    break;
            }
        });
        
        // Handle voice activity for visual feedback
        this.controller.audioCapture.onVoiceActivity = (event) => {
            if (event.isSpeaking && this.statusEl.classList.contains('listening')) {
                this.statusEl.classList.add('speaking');
                this.updateStatus('Listening to you...', 'speaking');
            } else if (!event.isSpeaking && this.statusEl.classList.contains('speaking')) {
                this.statusEl.classList.remove('speaking');
                this.updateStatus('Listening...', 'listening');
            }
            
            // Update voice level indicator if you add one
            this.updateVoiceLevel(event.energy);
        };
        
        // Handle transcripts
        this.controller.on('transcript', (data) => {
            if (data.role === 'user') {
                // Show user's speech in chat
                if (window.chatInstance) {
                    window.chatInstance.addBubble('user', data.text);
                }
            } else {
                // Show assistant's response
                if (window.chatInstance) {
                    window.chatInstance.addBubble('assistant', data.text);
                }
            }
        });
        
        // Handle errors
        this.controller.on('error', (event) => {
            console.error('Voice error:', event.error);
            this.updateStatus('Voice error - refresh to retry', 'error');
        });
        
        // Handle itinerary rendering
        this.controller.on('render_itinerary', (data) => {
            console.log('Rendering itinerary from voice command:', data);
            if (window.TravelApp && data.itinerary) {
                window.TravelApp.renderTripOnMap(data.itinerary);
            }
        });
    }
    
    updateStatus(text, className) {
        if (this.statusText) {
            this.statusText.textContent = text;
        }
        
        if (this.statusEl) {
            // Remove all state classes
            this.statusEl.classList.remove('initializing', 'connecting', 'listening', 
                                         'speaking', 'processing', 'assistant-speaking', 'error');
            // Add new state class
            if (className) {
                this.statusEl.classList.add(className);
            }
        }
    }
    
    updateVoiceLevel(energy) {
        // Convert energy to percentage (0-100)
        const level = Math.min(100, energy * 500);
        
        // Update a voice level bar if you have one
        const levelBar = document.querySelector('.voice-level-bar');
        if (levelBar) {
            levelBar.style.width = `${level}%`;
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Only initialize if we have all required components
    if (window.RealtimeController && window.VADProcessor) {
        window.continuousVoice = new ContinuousVoiceChat();
        console.log('Continuous voice chat starting...');
    } else {
        console.error('Required voice components not loaded');
    }
});