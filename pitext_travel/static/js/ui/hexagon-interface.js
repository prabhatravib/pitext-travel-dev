// static/js/ui/hexagon-interface.js - Simple Hexagon Interface Controller

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
        
        // Initialize voice if available
        if (window.VoiceUI) {
            try {
                this.voiceController = new window.VoiceUI();
                await this.voiceController.initialize();
                
                // Override the voice button with our mic button
                this.voiceController.buttonEl = this.micButton;
                this.voiceController.statusText = null; // We don't use status text
                
                // Set up voice event handlers
                this.setupVoiceHandlers();
            } catch (error) {
                console.log('Voice controller initialization failed:', error);
                // Voice will be set up later when ready
            }
        }
        
        console.log('HexagonInterface ready');
    }
    
    createInterface() {
        // Create the hexagon container
        this.container = document.createElement('div');
        this.container.className = 'hexagon-interface';
        this.container.innerHTML = `
            <div class="hexagon-content">
                <div class="hexagon-header">Plan Your Trip</div>
                
                <button class="hex-mic-button" id="hex-mic-button">
                    <svg viewBox="0 0 24 24">
                        <path d="M12 2a4 4 0 0 1 4 4v6a4 4 0 1 1-8 0V6a4 4 0 0 1 4-4z"/>
                        <path d="M19 10a7 7 0 0 1-14 0"/>
                        <path d="M12 19v4M8 23h8"/>
                    </svg>
                </button>
                
                <div class="hex-inputs">
                    <input type="text" id="hex-city" placeholder="City" value="Paris">
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
    
    setupVoiceHandlers() {
        if (!this.voiceController) return;
        
        // Check if controller is available
        if (!this.voiceController.controller) {
            console.log('Voice controller not ready yet, will setup handlers later');
            // Retry after a short delay
            setTimeout(() => this.setupVoiceHandlers(), 500);
            return;
        }
        
        // Handle state changes
        this.voiceController.controller.on('state_change', (event) => {
            switch (event.to) {
                case 'LISTENING':
                    this.setMicState('listening');
                    break;
                    
                case 'PROCESSING':
                    this.setMicState('processing');
                    break;
                    
                case 'SPEAKING':
                    this.setMicState('speaking');
                    break;
                    
                case 'WAITING':
                    this.setMicState('ready');
                    break;
            }
        });
        
        // Handle itinerary generation
        this.voiceController.controller.on('render_itinerary', (data) => {
            if (data.city && data.days) {
                this.cityInput.value = data.city;
                this.daysInput.value = data.days;
            }
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
                this.container.classList.add('processing');
                break;
            case 'speaking':
                this.container.classList.remove('processing');
                break;
            case 'ready':
                this.container.classList.remove('processing');
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
        }

        // Show a confirmation message in the chat
        if (window.chatInstance) {
            window.chatInstance.addBubble('assistant', `I've created your ${days}-day itinerary for ${city}! You can see it on the map.`);
        }
    }
}

// Add shake animation
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-10px); }
        75% { transform: translateX(10px); }
    }
`;
document.head.appendChild(shakeStyle);

// Export
window.HexagonInterface = HexagonInterface; 