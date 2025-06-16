// Audio capture with VAD integration
class AudioCapture {
    constructor() {
        this.stream = null;
        this.audioContext = null;
        this.processor = null;
        this.vadProcessor = null;
        this.isActive = false;
        
        // Audio settings
        this.sampleRate = 24000;
        this.channelCount = 1;
        
        // Callbacks
        this.onAudioData = null;
        this.onSpeechStart = null;
        this.onSpeechEnd = null;
        
        console.log('AudioCapture initialized');
    }
    
    async initialize() {
        try {
            // Get microphone permission
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: this.sampleRate,
                    channelCount: this.channelCount,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            
            // Create audio context
            // Create audio context - let browser choose its native rate
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

            // Store actual sample rate
            this.actualSampleRate = this.audioContext.sampleRate;
            console.log('[AudioCapture] Browser sample rate:', this.actualSampleRate);

            // We'll resample to 24kHz before sending
            this.targetSampleRate = 24000;
            // Log actual sample rate
            console.log('[AudioCapture] Audio context sample rate:', this.audioContext.sampleRate);
            if (this.audioContext.sampleRate !== 24000) {
                console.warn('[AudioCapture] Sample rate mismatch! Expected 24000, got:', this.audioContext.sampleRate);
            }
            
            // Initialize VAD
            this.vadProcessor = new window.VADProcessor({
                sampleRate: this.sampleRate,
                onSpeechStart: (event) => {
                    if (this.onSpeechStart) this.onSpeechStart(event);
                },
                onSpeechEnd: (event) => {
                    if (this.onSpeechEnd) this.onSpeechEnd(event);
                }
            });
            
            console.log('AudioCapture initialized successfully');
            return true;

            // Create audio context

            
        } catch (error) {
            console.error('Failed to initialize audio capture:', error);
            throw error;
        }
    }
    
    start() {
        if (!this.stream || this.isActive) return;
        
        const source = this.audioContext.createMediaStreamSource(this.stream);
        this.processor = this.audioContext.createScriptProcessor(2048, 1, 1);
        this.processor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            
            // Resample if needed
            let processedData = inputData;
            if (this.actualSampleRate !== this.targetSampleRate) {
                processedData = this._resample(inputData, this.actualSampleRate, this.targetSampleRate);
            }
            
            // Process through VAD
            const vadResult = this.vadProcessor.processAudio(processedData);
            
            // Log VAD state periodically
            if (Date.now() - (this.lastLogTime || 0) > 1000) {
                const state = this.vadProcessor.getState();
                console.log('[AudioCapture] VAD state:', {
                    isSpeaking: state.isSpeaking,
                    noiseFloor: state.noiseFloor.toFixed(4),
                    speechFrames: state.speechFrames
                });
                this.lastLogTime = Date.now();
            }
            
            // Send audio data if speaking
            if (vadResult.isSpeaking && this.onAudioData) {
                const pcm16 = this._float32ToPCM16(processedData);
                console.log('[AudioCapture] Sending audio chunk, size:', pcm16.byteLength);
                this.onAudioData(pcm16);
            }
        };    
        source.connect(this.processor);
        this.processor.connect(this.audioContext.destination);
        
        this.isActive = true;
        console.log('Audio capture started');
    }
    
    stop() {
        if (this.processor) {
            this.processor.disconnect();
            this.processor = null;
        }
        
        this.isActive = false;
        console.log('Audio capture stopped');
    }
    
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

    _resample(inputData, fromRate, toRate) {
            const ratio = toRate / fromRate;
            const outputLength = Math.floor(inputData.length * ratio);
            const output = new Float32Array(outputLength);
            
            for (let i = 0; i < outputLength; i++) {
                const srcIndex = i / ratio;
                const srcIndexInt = Math.floor(srcIndex);
                const srcIndexFrac = srcIndex - srcIndexInt;
                
                if (srcIndexInt < inputData.length - 1) {
                    output[i] = inputData[srcIndexInt] * (1 - srcIndexFrac) + 
                            inputData[srcIndexInt + 1] * srcIndexFrac;
                } else {
                    output[i] = inputData[srcIndexInt];
                }
            }
            
            return output;
        }
    
    isActive() {
        return this.isActive;
    }
    
    getVADState() {
        return this.vadProcessor ? this.vadProcessor.getState() : null;
    }
    
    updateVADParams(params) {
        if (this.vadProcessor) {
            this.vadProcessor.updateParams(params);
        }
    }
}

window.AudioCapture = AudioCapture;