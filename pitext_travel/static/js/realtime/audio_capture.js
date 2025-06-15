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
            this.audioContext = new AudioContext({
                sampleRate: this.sampleRate
            });
            
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
            
            // Process through VAD
            const vadResult = this.vadProcessor.processAudio(inputData);
            
            // Debug log
            if (vadResult.isSpeaking) {
                console.log('[AudioCapture] Speaking detected, sending audio');
            }
            
            // Send audio data if speaking
            if (vadResult.isSpeaking && this.onAudioData) {
                const pcm16 = this._float32ToPCM16(inputData);
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