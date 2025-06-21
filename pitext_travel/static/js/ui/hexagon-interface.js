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
        
        // Initialize with default trip data to show day controls
        this.initializeDefaultTrip();
        
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
                <div class="hexagon-header">Say or type your trip</div>
                
                <button class="hex-mic-button" id="hex-mic-button">
                    <svg viewBox="0 0 24 24">
                        <path d="M12 2a4 4 0 0 1 4 4v6a4 4 0 1 1-8 0V6a4 4 0 0 1 4-4z"/>
                        <path d="M19 10a7 7 0 0 1-14 0"/>
                        <path d="M12 19v4M8 23h8"/>
                    </svg>
                </button>
                
                <div class="hex-inputs">
                    <input type="text" id="hex-city" placeholder="City" value="Paris">
                    <input type="number" id="hex-days" placeholder="3" value="3" min="1" max="14">
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
    
    initializeDefaultTrip() {
        // Create default day controls to show immediately
        const dayControls = document.getElementById('day-controls');
        if (!dayControls) {
            console.warn('Day controls container not found');
            return;
        }
        
        // Create default 3-day controls
        const defaultDays = [
            { label: 'Day 1', color: '#FFADAD' },
            { label: 'Day 2', color: '#FFD6A5' },
            { label: 'Day 3', color: '#FDFFB6' }
        ];
        
        // Clear any existing controls completely
        while (dayControls.firstChild) {
            dayControls.removeChild(dayControls.firstChild);
        }
        dayControls.style.display = 'flex';
        
        // Create checkboxes for each day
        defaultDays.forEach((day, index) => {
            const wrapper = document.createElement('div');
            wrapper.style.display = 'flex';
            wrapper.style.flexDirection = 'column';
            wrapper.style.alignItems = 'center';
            wrapper.style.gap = '0.3rem';
            
            // Create label
            const label = document.createElement('label');
            label.style.color = day.color;
            label.style.fontWeight = 'bold';
            label.style.fontSize = '0.9rem';
            label.textContent = day.label;
            label.style.cursor = 'pointer';
            label.setAttribute('for', `day-checkbox-${index}`);
            
            // Create checkbox
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `day-checkbox-${index}`;
            checkbox.checked = index === 0; // Only first day checked by default
            checkbox.style.cursor = 'pointer';
            checkbox.style.width = '18px';
            checkbox.style.height = '18px';
            
            // Disable until trip is loaded
            checkbox.disabled = true;
            label.style.opacity = '0.6';
            
            wrapper.appendChild(label);
            wrapper.appendChild(checkbox);
            dayControls.appendChild(wrapper);
        });
        
        console.log('Default day controls created');
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
        
        // Update day controls when days input changes
        this.daysInput.addEventListener('change', () => this.updateDayControlsPreview());
    }
    
    updateDayControlsPreview() {
        const days = parseInt(this.daysInput.value, 10);
        if (!days || days < 1 || days > 14) return;
        
        const dayControls = document.getElementById('day-controls');
        if (!dayControls) return;
        
        // Clear existing controls completely
        while (dayControls.firstChild) {
            dayControls.removeChild(dayControls.firstChild);
        }
        
        // Create preview controls
        for (let i = 0; i < days; i++) {
            const wrapper = document.createElement('div');
            wrapper.style.display = 'flex';
            wrapper.style.flexDirection = 'column';
            wrapper.style.alignItems = 'center';
            wrapper.style.gap = '0.3rem';
            
            const dayIndex = i + 1;
            const color = window.TravelConstants ? window.TravelConstants.getColourForDay(dayIndex) : '#ccc';
            
            // Create label
            const label = document.createElement('label');
            label.style.color = color;
            label.style.fontWeight = 'bold';
            label.style.fontSize = '0.9rem';
            label.textContent = `Day ${dayIndex}`;
            label.style.cursor = 'pointer';
            label.setAttribute('for', `day-checkbox-${i}`);
            label.style.opacity = '0.6';
            
            // Create checkbox
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `day-checkbox-${i}`;
            checkbox.checked = i === 0;
            checkbox.disabled = true;
            checkbox.style.cursor = 'pointer';
            checkbox.style.width = '18px';
            checkbox.style.height = '18px';
            
            wrapper.appendChild(label);
            wrapper.appendChild(checkbox);
            dayControls.appendChild(wrapper);
        }
    }
    
    setupTripRenderingHooks() {
        // Store original renderTripOnMap function
        const originalRenderTripOnMap = window.TravelApp ? window.TravelApp.renderTripOnMap : null;
        
        if (window.TravelApp && originalRenderTripOnMap) {
            // Override renderTripOnMap to ensure day controls stay visible
            window.TravelApp.renderTripOnMap = (data) => {
                // Call original function
                originalRenderTripOnMap.call(window.TravelApp, data);
                
                // Ensure day controls are visible - but don't interfere with the rendering
                setTimeout(() => {
                    const dayControls = document.getElementById('day-controls');
                    if (dayControls) {
                        dayControls.style.display = 'flex';
                    }
                }, 100);
            };
        }
        
        // Listen for custom events
        document.addEventListener('tripRendered', () => {
            const dayControls = document.getElementById('day-controls');
            if (dayControls) {
                dayControls.style.display = 'flex';
            }
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
                this.updateDayControlsPreview();
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