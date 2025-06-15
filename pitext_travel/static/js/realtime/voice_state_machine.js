// static/js/realtime/voice_state_machine.js
// State machine for managing voice conversation flow

class VoiceStateMachine {
    constructor() {
        // Define states
        this.States = {
            WAITING: 'WAITING',        // Waiting for user speech
            LISTENING: 'LISTENING',    // User is speaking
            PROCESSING: 'PROCESSING',  // Processing user input
            SPEAKING: 'SPEAKING'       // Assistant is speaking
        };
        
        // Current state
        this.currentState = this.States.WAITING;
        this.previousState = null;
        
        // State transition callbacks
        this.stateHandlers = {
            onEnterWaiting: null,
            onEnterListening: null,
            onEnterProcessing: null,
            onEnterSpeaking: null,
            onExitWaiting: null,
            onExitListening: null,
            onExitProcessing: null,
            onExitSpeaking: null
        };
        
        // Event handlers
        this.onStateChange = null;
        this.onError = null;
        
        // Timeout handling
        this.timeouts = {
            processing: 10000,  // Max 10s for processing
            speaking: 30000,    // Max 30s for speaking
            listening: 30000    // Max 30s for listening
        };
        this.currentTimeout = null;
        
        // State history for debugging
        this.stateHistory = [];
        this.maxHistorySize = 50;
        
        // Transition rules
        this.transitions = {
            WAITING: {
                speechDetected: this.States.LISTENING
            },
            LISTENING: {
                speechEnded: this.States.PROCESSING,
                userInterrupt: this.States.WAITING,
                timeout: this.States.PROCESSING
            },
            PROCESSING: {
                responseStarted: this.States.SPEAKING,
                processingFailed: this.States.WAITING,
                timeout: this.States.WAITING
            },
            SPEAKING: {
                speechCompleted: this.States.WAITING,
                userInterrupt: this.States.LISTENING,
                timeout: this.States.WAITING
            }
        };
        
        console.log('VoiceStateMachine initialized in state:', this.currentState);
    }
    
    /**
     * Transition to a new state
     * @param {string} event - The event triggering the transition
     * @param {Object} data - Additional data for the transition
     */
    transition(event, data = {}) {
        const fromState = this.currentState;
        const transitions = this.transitions[fromState];
        
        if (!transitions || !transitions[event]) {
            console.warn(`Invalid transition: ${event} from state ${fromState}`);
            return false;
        }
        
        const toState = transitions[event];
        
        // Validate transition
        if (!this._validateTransition(fromState, toState, event)) {
            return false;
        }
        
        // Execute transition
        this._executeTransition(fromState, toState, event, data);
        
        return true;
    }
    
    /**
     * Execute state transition
     * @private
     */
    _executeTransition(fromState, toState, event, data) {
        console.log(`State transition: ${fromState} -> ${toState} (event: ${event})`);
        
        // Clear any existing timeout
        this._clearTimeout();
        
        // Call exit handler for current state
        const exitHandler = this.stateHandlers[`onExit${this._capitalizeFirst(fromState.toLowerCase())}`];
        if (exitHandler) {
            try {
                exitHandler(data);
            } catch (error) {
                console.error(`Error in exit handler for ${fromState}:`, error);
            }
        }
        
        // Update state
        this.previousState = fromState;
        this.currentState = toState;
        
        // Add to history
        this._addToHistory({
            from: fromState,
            to: toState,
            event,
            timestamp: Date.now()
        });
        
        // Call enter handler for new state
        const enterHandler = this.stateHandlers[`onEnter${this._capitalizeFirst(toState.toLowerCase())}`];
        if (enterHandler) {
            try {
                enterHandler(data);
            } catch (error) {
                console.error(`Error in enter handler for ${toState}:`, error);
            }
        }
        
        // Set timeout for new state
        this._setStateTimeout(toState);
        
        // Notify state change
        if (this.onStateChange) {
            this.onStateChange({
                from: fromState,
                to: toState,
                event,
                data
            });
        }
    }
    
    /**
     * Validate state transition
     * @private
     */
    _validateTransition(fromState, toState, event) {
        // Add any custom validation logic here
        // For now, all defined transitions are valid
        return true;
    }
    
    /**
     * Set timeout for current state
     * @private
     */
    _setStateTimeout(state) {
        const timeout = this.timeouts[state.toLowerCase()];
        if (!timeout) return;
        
        this.currentTimeout = setTimeout(() => {
            console.warn(`State ${state} timeout after ${timeout}ms`);
            this.transition('timeout', { reason: 'State timeout' });
        }, timeout);
    }
    
    /**
     * Clear current timeout
     * @private
     */
    _clearTimeout() {
        if (this.currentTimeout) {
            clearTimeout(this.currentTimeout);
            this.currentTimeout = null;
        }
    }
    
    /**
     * Add transition to history
     * @private
     */
    _addToHistory(transition) {
        this.stateHistory.push(transition);
        
        // Maintain history size
        while (this.stateHistory.length > this.maxHistorySize) {
            this.stateHistory.shift();
        }
    }
    
    /**
     * Handle speech detection event
     */
    onSpeechDetected(data) {
        if (this.currentState === this.States.WAITING) {
            this.transition('speechDetected', data);
        } else if (this.currentState === this.States.SPEAKING) {
            // Barge-in detected
            this.transition('userInterrupt', { ...data, bargeIn: true });
        }
    }
    
    /**
     * Handle speech end event
     */
    onSpeechEnded(data) {
        if (this.currentState === this.States.LISTENING) {
            this.transition('speechEnded', data);
        }
    }
    
    /**
     * Handle response started event
     */
    onResponseStarted(data) {
        if (this.currentState === this.States.PROCESSING) {
            this.transition('responseStarted', data);
        }
    }
    
    /**
     * Handle speech completed event
     */
    onSpeechCompleted(data) {
        if (this.currentState === this.States.SPEAKING) {
            this.transition('speechCompleted', data);
        }
    }
    
    /**
     * Handle processing error
     */
    onProcessingError(error) {
        console.error('Processing error:', error);
        
        if (this.currentState === this.States.PROCESSING) {
            this.transition('processingFailed', { error });
        }
        
        if (this.onError) {
            this.onError(error);
        }
    }
    
    /**
     * Force transition to a specific state (for error recovery)
     */
    forceState(state) {
        if (!Object.values(this.States).includes(state)) {
            console.error(`Invalid state: ${state}`);
            return;
        }
        
        console.warn(`Forcing state transition to ${state}`);
        
        this._clearTimeout();
        this.previousState = this.currentState;
        this.currentState = state;
        
        this._addToHistory({
            from: this.previousState,
            to: state,
            event: 'forced',
            timestamp: Date.now()
        });
        
        if (this.onStateChange) {
            this.onStateChange({
                from: this.previousState,
                to: state,
                event: 'forced',
                data: {}
            });
        }
    }
    
    /**
     * Get current state
     */
    getState() {
        return this.currentState;
    }
    
    /**
     * Check if in a specific state
     */
    isInState(state) {
        return this.currentState === state;
    }
    
    /**
     * Get state history
     */
    getHistory() {
        return [...this.stateHistory];
    }
    
    /**
     * Get last transition
     */
    getLastTransition() {
        return this.stateHistory[this.stateHistory.length - 1] || null;
    }
    
    /**
     * Register state handler
     */
    on(handlerName, callback) {
        if (this.stateHandlers.hasOwnProperty(handlerName)) {
            this.stateHandlers[handlerName] = callback;
        } else {
            console.warn(`Unknown handler: ${handlerName}`);
        }
    }
    
    /**
     * Reset state machine
     */
    reset() {
        this._clearTimeout();
        this.currentState = this.States.WAITING;
        this.previousState = null;
        this.stateHistory = [];
        
        console.log('VoiceStateMachine reset to WAITING state');
    }
    
    /**
     * Utility: Capitalize first letter
     * @private
     */
    _capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
    
    /**
     * Get state summary for debugging
     */
    getDebugInfo() {
        return {
            currentState: this.currentState,
            previousState: this.previousState,
            hasTimeout: !!this.currentTimeout,
            historyLength: this.stateHistory.length,
            lastTransitions: this.stateHistory.slice(-5)
        };
    }
}

// Export for use in other modules
window.VoiceStateMachine = VoiceStateMachine;