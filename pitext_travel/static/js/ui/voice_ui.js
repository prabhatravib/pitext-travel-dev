// static/js/ui/voice_ui.js
// Enhanced Voice UI controller with improved map integration

class VoiceUI {
    constructor() {
        this.controller = null;
        this.buttonEl = document.getElementById('voice-button');
        this.statusText = document.querySelector('.status-text');
        this.voiceCircle = document.querySelector('.voice-circle');
        
        this.isReady = false;
        this.isListening = false;
        this.isAssistantSpeaking = false;
        this.initializationAttempts = 0;
        this.maxInitAttempts = 3;
        
        console.log('VoiceUI initialized');
    }
    
    async initialize() {
        if (!this.buttonEl) {
            console.warn('Voice button element not found');
            return false;
        }
        
        try {
            this.updateStatus('Checking microphone access...', 'initializing');
            
            // Check for required dependencies
            if (!this._checkDependencies()) {
                throw new Error('Required voice components not available');
            }
            
            // Initialize the realtime controller
            this.controller = new window.RealtimeController();
            
            // Set up event handlers before initialization
            this.setupEventHandlers();
            
            const initialized = await this.controller.initialize();
            if (!initialized) {
                throw new Error('Failed to initialize audio components');
            }
            
            this.setupClickHandler();
            this.isReady = true;
            this.updateStatus('Ready - Click to start voice chat', 'ready');
            
            // Integrate with main app if available
            if (window.TravelApp && window.TravelApp.setupVoiceIntegration) {
                window.TravelApp.setupVoiceIntegration(this.controller);
                console.log('✅ Voice integrated with main app');
            }
            
            console.log('✅ VoiceUI initialized successfully');
            return true;
            
        } catch (error) {
            this.initializationAttempts++;
            console.error(`Voice UI initialization failed (attempt ${this.initializationAttempts}):`, error);
            
            if (this.initializationAttempts < this.maxInitAttempts) {
                console.log(`Retrying voice initialization in 2 seconds...`);
                setTimeout(() => this.initialize(), 2000);
                this.updateStatus('Retrying initialization...', 'initializing');
                return false;
            } else {
                this.updateStatus('Voice unavailable - Check microphone', 'error');
                return false;
            }
        }
    }
    
    _checkDependencies() {
        const required = [
            'RealtimeController',
            'AudioCapture', 
            'AudioPlayer',
            'WebSocketClient',
            'VoiceStateMachine'
        ];
        
        for (const dep of required) {
            if (!window[dep]) {
                console.error(`Missing required dependency: ${dep}`);
                return false;
            }
        }
        
        // Check for WebSocket support
        if (!window.io) {
            console.error('Socket.IO not available');
            return false;
        }
        
        // Check for audio support
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.error('Microphone access not supported');
            return false;
        }
        
        return true;
    }
    
    setupClickHandler() {
        if (!this.buttonEl) return;
        
        this.buttonEl.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (!this.isReady) {
                console.log('Click ignored - not ready');
                return;
            }
            
            if (this.isAssistantSpeaking) {
                console.log('Click ignored - assistant is speaking');
                return;
            }
            
            await this.toggleListening();
        });
        
        console.log('Click handler set up');
    }
    
    async toggleListening() {
        if (this.isListening) {
            // Stop listening
            console.log('🛑 Stopping voice chat...');
            this.controller.disconnect();
            this.isListening = false;
            this.updateStatus('Ready - Click to start voice chat', 'ready');
            
            // Disable audio capture
            if (this.controller.audioCapture) {
                this.controller.audioCapture.setEnabled(false);
            }
        } else {
            // Start listening
            console.log('🎤 Starting voice chat...');
            this.updateStatus('Connecting to voice service...', 'connecting');
            
            const connected = await this.controller.connect();
            
            if (connected) {
                this.isListening = true;
                this.updateStatus('Listening... Speak naturally!', 'listening');
                
                // Enable audio capture
                if (this.controller.audioCapture) {
                    this.controller.audioCapture.setEnabled(true);
                }
                
                console.log('✅ Voice chat started successfully');
            } else {
                this.updateStatus('Connection failed - Click to retry', 'error');
                console.error('❌ Failed to start voice chat');
            }
        }
        
        this.updateButtonState();
    }
    
    setupEventHandlers() {
        // Handle state changes from RealtimeController
        this.controller.on('state_change', (event) => {
            console.log(`🔄 Voice state: ${event.from} → ${event.to}`);
            
            switch (event.to) {
                case 'LISTENING':
                    this.updateStatus('👂 Listening to you...', 'speaking');
                    this.isAssistantSpeaking = false;
                    break;
                    
                case 'PROCESSING':
                    this.updateStatus('🧠 Processing your request...', 'processing');
                    break;
                    
                case 'SPEAKING':
                    this.updateStatus('🗣️ Assistant speaking...', 'assistant-speaking');
                    this.isAssistantSpeaking = true;
                    break;
                    
                case 'WAITING':
                    this.updateStatus('✅ Ready - Speak when ready!', 'listening');
                    this.isAssistantSpeaking = false;
                    
                    // Re-enable audio capture if still listening
                    if (this.controller.audioCapture && this.isListening) {
                        this.controller.audioCapture.setEnabled(true);
                    }
                    break;
            }
            
            this.updateButtonState();
        });
        
        // Handle connection events
        this.controller.on('connected', () => {
            console.log('🔗 Voice service connected');
        });
        
        this.controller.on('ready', () => {
            console.log('✅ Voice session ready');
            this.updateStatus('Listening... Speak naturally!', 'listening');
        });
        
        // Handle transcripts for chat display
        this.controller.on('transcript', (data) => {
            if (window.chatInstance) {
                window.chatInstance.updateTranscript(data);
            }
        });
        
        // Handle itinerary rendering - ENHANCED INTEGRATION
        this.controller.on('render_itinerary', (data) => {
            console.log('🎤 Voice triggered itinerary render:', data);
            
            if (window.TravelApp && data.itinerary) {
                // Ensure map is ready
                if (window.mapModulesReady) {
                    console.log('🗺️ Map ready, rendering itinerary immediately');
                    window.TravelApp.renderTripOnMap(data.itinerary);
                } else {
                    console.log('🗺️ Map not ready, queuing for later');
                    window.pendingRender = data.itinerary;
                }
                
                // Add success message to chat
                if (window.chatInstance) {
                    const city = data.city || 'your destination';
                    const days = data.days || 'several';
                    window.chatInstance.addBubble('assistant', 
                        `🗺️ I've created your ${days}-day itinerary for ${city}! You can see it on the map.`
                    );
                }
            }
        });
        
        // Handle errors
        this.controller.on('error', (error) => {
            console.error('🚫 Voice error:', error);
            this.updateStatus('Voice error - Click to retry', 'error');
            this.isListening = false;
            this.isAssistantSpeaking = false;
            this.updateButtonState();
        });
        
        // Handle disconnection
        this.controller.on('disconnected', () => {
            console.log('🔌 Voice service disconnected');
            this.isListening = false;
            this.isAssistantSpeaking = false;
            this.updateButtonState();
        });
        
        // Handle OpenAI VAD events
        this.controller.on('speech_started', () => {
            console.log('🎤 OpenAI detected speech start');
        });
        
        this.controller.on('speech_stopped', () => {
            console.log('🔇 OpenAI detected speech end');
        });
        
        console.log('Event handlers configured');
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
        
        console.log(`🎭 Status: ${text}`);
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
        if (!this.isListening && this.isReady) {
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
            initializationAttempts: this.initializationAttempts,
            controller: this.controller ? this.controller.getState() : null
        };
    }
    
    // Force restart if needed
    async restart() {
        console.log('🔄 Restarting voice UI...');
        
        if (this.controller) {
            this.controller.disconnect();
        }
        
        this.isReady = false;
        this.isListening = false;
        this.isAssistantSpeaking = false;
        this.initializationAttempts = 0;
        
        return await this.initialize();
    }
}

// Export for global use
window.VoiceUI = VoiceUI;