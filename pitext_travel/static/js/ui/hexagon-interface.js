// static/js/ui/hexagon-interface.js - Unified Hexagon Interface Controller

class HexagonInterface {
    constructor() {
        this.container = null;
        this.micButton = null;
        this.cityInput = null;
        this.daysInput = null;
        this.launchButton = null;
        this.voiceController = null;
        this.isListening = false;
        
        console.log('HexagonInterface initialized');
    }
    
    async initialize() {
        // Create the hexagon interface
        this.createInterface();
        
        // Set up event handlers
        this.setupEventHandlers();
        
        // Hook into trip rendering events
        this.setupTripRenderingHooks();
        
        // Initialize voice if available
        if (window.VoiceUI) {
            this.voiceController = new window.VoiceUI();
            await this.voiceController.initialize();
            
            // Override the voice button with our mic button
            this.voiceController.buttonEl = this.micButton;
            this.voiceController.statusText = null; // We don't use status text
            
            // Set up voice event handlers
            this.setupVoiceHandlers();
        }
        
        console.log('HexagonInterface ready');
    }
    
    createInterface() {
        // Create the hexagon container
        this.container = document.createElement('div');
        this.container.className = 'hexagon-interface';
        this.container.innerHTML = `
            <div class="hexagon-content">
                <div class="hexagon-header">Say or type your trip</div>
                
                <button class="hex-mic-button" id="hex-mic-button">
                    <svg viewBox="0 0 24 24">
                        <path d="M12 2a4 4 0 0 1 4 4v6a4 4 0 1 1-8 0V6a4 4 0 0 1 4-4z"/>
                        <path d="M19 10a7 7 0 0 1-14 0"/>
                        <path d="M12 19v4M8 23h8"/>
                    </svg>
                </button>
                
                <div class="hex-inputs">
                    <input type="text" id="hex-city" placeholder="Paris" value="Paris">
                    <input type="number" id="hex-days" placeholder="Days" value="3" min="1" max="14">
                </div>
                
                <button class="hex-launch-button" id="hex-launch">Launch Trip</button>
            </div>
        `;
        
        // Add to body
        document.body.appendChild(this.container);
        
        // Get references
        this.micButton = document.getElementById('hex-mic-button');
        this.cityInput = document.getElementById('hex-city');
        this.daysInput = document.getElementById('hex-days');
        this.launchButton = document.getElementById('hex-launch');
    }
    
    setupEventHandlers() {
        // Mic button click
        this.micButton.addEventListener('click', () => this.toggleVoice());
        
        // Launch button click
        this.launchButton.addEventListener('click', () => this.launchTrip());
        
        // Enter key on inputs
        this.cityInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.launchTrip();
        });
        
        this.daysInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.launchTrip();
        });
    }
    
    setupTripRenderingHooks() {
        // Store original renderTripOnMap function
        const originalRenderTripOnMap = window.TravelApp ? window.TravelApp.renderTripOnMap : null;
        
        if (window.TravelApp && originalRenderTripOnMap) {
            // Override renderTripOnMap to show day controls
            window.TravelApp.renderTripOnMap = (data) => {
                // Call original function
                originalRenderTripOnMap.call(window.TravelApp, data);
                
                // Show day controls after trip is rendered
                setTimeout(() => {
                    const dayControls = document.getElementById('day-controls');
                    if (dayControls) {
                        dayControls.classList.add('visible');
                    }
                }, 100);
            };
        }
        
        // Listen for custom events
        document.addEventListener('tripRendered', () => {
            const dayControls = document.getElementById('day-controls');
            if (dayControls) {
                dayControls.classList.add('visible');
            }
        });
    }
    
    setupVoiceHandlers() {
        if (!this.voiceController) return;
        
        // Override the click handler
        this.micButton.removeEventListener('click', this.voiceController.toggleListening);
        
        // Handle state changes
        this.voiceController.controller.on('state_change', (event) => {
            switch (event.to) {
                case 'LISTENING':
                    this.setMicState('listening');
                    this.container.classList.remove('processing', 'speaking');
                    break;
                    
                case 'PROCESSING':
                    this.setMicState('processing');
                    this.container.classList.add('processing');
                    this.container.classList.remove('speaking');
                    break;
                    
                case 'SPEAKING':
                    this.setMicState('speaking');
                    this.container.classList.remove('processing');
                    this.container.classList.add('speaking');
                    break;
                    
                case 'WAITING':
                    this.setMicState('ready');
                    this.container.classList.remove('processing', 'speaking');
                    break;
            }
        });
        
        // Handle itinerary generation
        this.voiceController.controller.on('render_itinerary', (data) => {
            if (data.city && data.days) {
                this.cityInput.value = data.city;
                this.daysInput.value = data.days;
            }
            
            // Day controls will show automatically when trip is rendered
        });
    }
    
    async toggleVoice() {
        if (!this.voiceController || !this.voiceController.isReady) {
            console.log('Voice not ready');
            return;
        }
        
        await this.voiceController.toggleListening();
        this.isListening = this.voiceController.isListening;
        
        if (this.isListening) {
            this.micButton.classList.add('listening');
        } else {
            this.micButton.classList.remove('listening');
        }
    }
    
    setMicState(state) {
        this.micButton.classList.remove('listening', 'processing', 'speaking');
        
        switch (state) {
            case 'listening':
                this.micButton.classList.add('listening');
                break;
            case 'processing':
                // Visual state handled by container
                break;
            case 'speaking':
                // Visual state handled by container
                break;
        }
    }
    
    async launchTrip() {
        const city = this.cityInput.value.trim();
        const days = parseInt(this.daysInput.value, 10);
        
        if (!city || !days || days < 1 || days > 14) {
            // Flash error state
            this.container.style.animation = 'shake 0.3s';
            setTimeout(() => {
                this.container.style.animation = '';
            }, 300);
            return;
        }
        
        // Process the itinerary
        if (window.TravelApp && window.TravelApp.processItinerary) {
            await window.TravelApp.processItinerary(city, days);
            
            // Day controls will show automatically when trip is rendered
        }
    }
}

// Add shake animation
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
    @keyframes shake {
        0%, 100% { transform: translate(-50%, 50%) translateX(0); }
        25% { transform: translate(-50%, 50%) translateX(-10px); }
        75% { transform: translate(-50%, 50%) translateX(10px); }
    }
`;
document.head.appendChild(shakeStyle);

// Export
window.HexagonInterface = HexagonInterface;