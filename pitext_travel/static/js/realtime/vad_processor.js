// static/js/realtime/vad_processor.js
// WebRTC VAD (Voice Activity Detection) processor for real-time speech detection

class VADProcessor {
    constructor(options = {}) {
        // VAD configuration - made more conservative
        this.sampleRate = options.sampleRate || 24000;
        this.frameSize = options.frameSize || 20; // ms
        this.vadMode = options.vadMode || 1; // Changed from 3 to 1 (less aggressive)
        this.vadThreshold = options.vadThreshold || 0.5;
        
        // Calculate samples per frame
        this.samplesPerFrame = Math.floor(this.sampleRate * this.frameSize / 1000);
        
        // Speech detection parameters - made more conservative
        this.speechThreshold = options.speechThreshold || 0.025; // Increased from 0.015
        this.silenceThreshold = options.silenceThreshold || 0.01;
        this.speechPadding = options.speechPadding || 300; // ms before speech
        this.silenceDuration = options.silenceDuration || 800; // Increased from 500ms
        
        // State tracking
        this.isSpeaking = false;
        this.silenceStart = null;
        this.speechFrames = 0;
        this.silenceFrames = 0;
        
        // Pre-buffer for capturing audio before speech detection
        this.preBufferSize = Math.ceil(this.speechPadding / this.frameSize);
        this.preBuffer = [];
        
        // Frame buffer for processing
        this.frameBuffer = new Float32Array(this.samplesPerFrame);
        this.frameBufferIndex = 0;
        
        // Callbacks
        this.onSpeechStart = null;
        this.onSpeechEnd = null;
        this.onVoiceActivity = null;
        
        // Energy tracking for adaptive thresholds
        this.energyHistory = [];
        this.maxEnergyHistory = 50;
        this.noiseFloor = 0.01;
        
        // Debouncing and stability
        this.lastSpeechEvent = 0;
        this.lastSilenceEvent = 0;
        this.minEventInterval = 200; // Minimum time between events (ms)
        
        console.log('VADProcessor initialized:', {
            sampleRate: this.sampleRate,
            frameSize: this.frameSize,
            samplesPerFrame: this.samplesPerFrame,
            vadMode: this.vadMode,
            speechThreshold: this.speechThreshold,
            silenceDuration: this.silenceDuration
        });
    }
    
    /**
     * Process audio samples for VAD
     * @param {Float32Array} samples - Audio samples to process
     * @returns {Object} - Processing result with speech detection info
     */
    processAudio(samples) {
        const results = [];
        
        // Process samples frame by frame
        for (let i = 0; i < samples.length; i++) {
            this.frameBuffer[this.frameBufferIndex++] = samples[i];
            
            // Process complete frame
            if (this.frameBufferIndex >= this.samplesPerFrame) {
                const frameResult = this._processFrame(this.frameBuffer);
                results.push(frameResult);
                
                // Reset frame buffer
                this.frameBufferIndex = 0;
                this.frameBuffer.fill(0);
            }
        }
        
        return {
            frames: results,
            isSpeaking: this.isSpeaking,
            speechFrames: this.speechFrames,
            silenceFrames: this.silenceFrames
        };
    }
    
    /**
     * Process a single frame for VAD
     * @private
     */
    _processFrame(frame) {
        // Calculate frame energy (RMS)
        const energy = this._calculateRMS(frame);
        
        // Update energy history for adaptive threshold
        this._updateEnergyHistory(energy);
        
        // Determine if frame contains speech - add minimum energy check
        const isSpeech = energy > 0.005 && this._detectSpeech(energy); // Added minimum threshold
        
        // Create frame data including pre-buffer if needed
        const frameData = new Float32Array(frame);
        
        // Update pre-buffer
        this._updatePreBuffer(frameData);
        
        // Track speech/silence frames with improved logic
        if (isSpeech) {
            this.speechFrames++;
            this.silenceFrames = 0;
            this.silenceStart = null;
            
            // Require more consecutive speech frames before triggering
            if (!this.isSpeaking && this.speechFrames >= 5) { // Changed from 3 to 5 frames
                this._handleSpeechStart();
            }
        } else {
            this.silenceFrames++;
            
            if (this.isSpeaking) {
                if (!this.silenceStart) {
                    this.silenceStart = Date.now();
                }
                
                // Check for speech end - require more silence frames
                const silenceDuration = Date.now() - this.silenceStart;
                if (silenceDuration >= this.silenceDuration && this.silenceFrames >= 15) { // Added frame count requirement
                    this._handleSpeechEnd();
                }
            } else {
                // Gradual decay instead of immediate reset
                this.speechFrames = Math.max(0, this.speechFrames - 1);
            }
        }
        
        // Notify voice activity
        if (this.onVoiceActivity) {
            this.onVoiceActivity({
                energy,
                isSpeech,
                isSpeaking: this.isSpeaking,
                timestamp: Date.now()
            });
        }
        
        return {
            frame: frameData,
            energy,
            isSpeech,
            isSpeaking: this.isSpeaking
        };
    }
    
    /**
     * Calculate RMS (Root Mean Square) energy of frame
     * @private
     */
    _calculateRMS(frame) {
        let sum = 0;
        for (let i = 0; i < frame.length; i++) {
            sum += frame[i] * frame[i];
        }
        return Math.sqrt(sum / frame.length);
    }
    
    /**
     * Detect speech based on energy and adaptive threshold
     * @private
     */
    _detectSpeech(energy) {
        // Use adaptive threshold based on noise floor
        const adaptiveThreshold = Math.max(
            this.speechThreshold,
            this.noiseFloor * 3.5 // Increased from 2.5 to 3.5
        );
        
        // Apply VAD mode (higher modes are more aggressive) - reduced sensitivity
        const modeMultiplier = 1 + (this.vadMode * 0.15); // Reduced from 0.2 to 0.15
        const threshold = adaptiveThreshold * modeMultiplier;
        
        return energy > threshold;
    }
    
    /**
     * Update energy history for adaptive thresholding
     * @private
     */
    _updateEnergyHistory(energy) {
        this.energyHistory.push(energy);
        
        if (this.energyHistory.length > this.maxEnergyHistory) {
            this.energyHistory.shift();
        }
        
        // Update noise floor (use lower percentile of energy)
        if (this.energyHistory.length >= 10) {
            const sorted = [...this.energyHistory].sort((a, b) => a - b);
            const percentileIndex = Math.floor(sorted.length * 0.15); // Increased from 0.1 to 0.15
            this.noiseFloor = sorted[percentileIndex];
        }
    }
    
    /**
     * Update pre-buffer with frame data
     * @private
     */
    _updatePreBuffer(frameData) {
        // Convert to PCM16 for storage efficiency
        const pcm16 = this._float32ToPCM16(frameData);
        
        this.preBuffer.push(pcm16);
        
        // Maintain buffer size
        while (this.preBuffer.length > this.preBufferSize) {
            this.preBuffer.shift();
        }
    }
    
    /**
     * Handle speech start event with debouncing
     * @private
     */
    _handleSpeechStart() {
        const now = Date.now();
        
        // Debounce speech start events
        if (now - this.lastSpeechEvent < this.minEventInterval) {
            console.log('VAD: Speech start debounced');
            return;
        }
        
        this.isSpeaking = true;
        this.lastSpeechEvent = now;
        console.log('VAD: Speech started');
        
        if (this.onSpeechStart) {
            // Get pre-buffered audio
            const preBufferedAudio = this._getPreBufferedAudio();
            
            this.onSpeechStart({
                timestamp: now,
                preBufferedAudio
            });
        }
    }
    
    /**
     * Handle speech end event with debouncing
     * @private
     */
    _handleSpeechEnd() {
        const now = Date.now();
        
        // Debounce speech end events
        if (now - this.lastSilenceEvent < this.minEventInterval) {
            console.log('VAD: Speech end debounced');
            return;
        }
        
        this.isSpeaking = false;
        this.speechFrames = 0;
        this.silenceFrames = 0;
        this.silenceStart = null;
        this.lastSilenceEvent = now;
        
        console.log('VAD: Speech ended');
        
        if (this.onSpeechEnd) {
            this.onSpeechEnd({
                timestamp: now
            });
        }
    }
    
    /**
     * Get pre-buffered audio data
     * @private
     */
    _getPreBufferedAudio() {
        // Combine all pre-buffer frames
        const totalLength = this.preBuffer.reduce((sum, buf) => sum + buf.byteLength, 0);
        const combined = new ArrayBuffer(totalLength);
        const view = new DataView(combined);
        
        let offset = 0;
        for (const buffer of this.preBuffer) {
            const sourceView = new DataView(buffer);
            for (let i = 0; i < buffer.byteLength; i++) {
                view.setUint8(offset + i, sourceView.getUint8(i));
            }
            offset += buffer.byteLength;
        }
        
        return combined;
    }
    
    /**
     * Convert Float32Array to PCM16 ArrayBuffer
     * @private
     */
    _float32ToPCM16(float32Array) {
        const buffer = new ArrayBuffer(float32Array.length * 2);
        const view = new DataView(buffer);
        
        let offset = 0;
        for (let i = 0; i < float32Array.length; i++, offset += 2) {
            const s = Math.max(-1, Math.min(1, float32Array[i]));
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }
        
        return buffer;
    }
    
    /**
     * Reset VAD state
     */
    reset() {
        this.isSpeaking = false;
        this.silenceStart = null;
        this.speechFrames = 0;
        this.silenceFrames = 0;
        this.preBuffer = [];
        this.frameBuffer.fill(0);
        this.frameBufferIndex = 0;
        this.energyHistory = [];
        this.noiseFloor = 0.01;
        this.lastSpeechEvent = 0;
        this.lastSilenceEvent = 0;
        
        console.log('VAD: Reset');
    }
    
    /**
     * Update VAD parameters
     */
    updateParams(params) {
        if (params.speechThreshold !== undefined) {
            this.speechThreshold = params.speechThreshold;
            console.log('VAD: Speech threshold updated to', this.speechThreshold);
        }
        if (params.silenceThreshold !== undefined) {
            this.silenceThreshold = params.silenceThreshold;
        }
        if (params.silenceDuration !== undefined) {
            this.silenceDuration = params.silenceDuration;
            console.log('VAD: Silence duration updated to', this.silenceDuration);
        }
        if (params.vadMode !== undefined) {
            this.vadMode = Math.max(0, Math.min(3, params.vadMode));
            console.log('VAD: Mode updated to', this.vadMode);
        }
        
        console.log('VAD: Parameters updated', params);
    }
    
    /**
     * Get current VAD state
     */
    getState() {
        return {
            isSpeaking: this.isSpeaking,
            speechFrames: this.speechFrames,
            silenceFrames: this.silenceFrames,
            noiseFloor: this.noiseFloor,
            preBufferSize: this.preBuffer.length,
            lastSpeechEvent: this.lastSpeechEvent,
            lastSilenceEvent: this.lastSilenceEvent
        };
    }
    
    /**
     * Get debug information
     */
    getDebugInfo() {
        return {
            config: {
                sampleRate: this.sampleRate,
                frameSize: this.frameSize,
                vadMode: this.vadMode,
                speechThreshold: this.speechThreshold,
                silenceDuration: this.silenceDuration
            },
            state: this.getState(),
            energyStats: {
                historyLength: this.energyHistory.length,
                noiseFloor: this.noiseFloor,
                currentEnergy: this.energyHistory[this.energyHistory.length - 1] || 0
            }
        };
    }
}

// Export for use in other modules
window.VADProcessor = VADProcessor;