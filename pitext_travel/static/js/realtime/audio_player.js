// static/js/realtime/audio_player.js
// Audio playback for TTS from Realtime API with proper queuing

class AudioPlayer {
    constructor() {
        this.audioContext = null;
        this.isPlaying = false;
        this.audioQueue = [];
        this.currentSource = null;
        
        // Audio settings
        this.sampleRate = 24000;  // OpenAI outputs 24kHz
        this.channelCount = 1;    // Mono
        
        // Callbacks
        this.onPlaybackStart = null;
        this.onPlaybackEnd = null;
        this.onError = null;
        
        // Processing state
        this.isProcessingQueue = false;
        
        console.log('AudioPlayer initialized');
    }
    
    async initialize() {
        try {
            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: this.sampleRate
            });
            
            // Resume context if suspended
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            
            console.log('AudioPlayer initialized successfully');
            return true;
            
        } catch (error) {
            console.error('Failed to initialize audio player:', error);
            if (this.onError) {
                this.onError(error);
            }
            return false;
        }
    }
    
    async playAudioData(audioData) {
        if (!this.audioContext) {
            console.error('AudioContext not initialized');
            return;
        }
        
        try {
            // Convert base64 to ArrayBuffer if needed
            let arrayBuffer;
            if (typeof audioData === 'string') {
                arrayBuffer = this._base64ToArrayBuffer(audioData);
            } else {
                arrayBuffer = audioData;
            }
            
            // Decode PCM16 to Float32
            const float32Array = this._pcm16ToFloat32(new Int16Array(arrayBuffer));
            
            // Create audio buffer
            const audioBuffer = this.audioContext.createBuffer(
                this.channelCount,
                float32Array.length,
                this.sampleRate
            );
            
            // Copy data to buffer
            audioBuffer.copyToChannel(float32Array, 0);
            
            // Add to queue instead of playing immediately
            this.audioQueue.push(audioBuffer);
            
            // Process queue if not already processing
            if (!this.isProcessingQueue) {
                this._processQueue();
            }
            
        } catch (error) {
            console.error('Failed to queue audio:', error);
            if (this.onError) {
                this.onError(error);
            }
        }
    }
    
    async _processQueue() {
        if (this.isProcessingQueue || this.audioQueue.length === 0) {
            return;
        }
        
        this.isProcessingQueue = true;
        
        while (this.audioQueue.length > 0) {
            const audioBuffer = this.audioQueue.shift();
            
            try {
                await this._playBuffer(audioBuffer);
                
                // Small gap between chunks to prevent clicks
                await this._wait(5);
                
            } catch (error) {
                console.error('Error playing buffer:', error);
            }
        }
        
        this.isProcessingQueue = false;
        this.isPlaying = false;
        
        // Notify playback end
        if (this.onPlaybackEnd) {
            this.onPlaybackEnd();
        }
    }
    
    _playBuffer(audioBuffer) {
        return new Promise((resolve) => {
            // Create buffer source
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.audioContext.destination);
            
            // Handle end of playback
            source.onended = () => {
                this.currentSource = null;
                resolve();
            };
            
            // Start playback tracking
            if (!this.isPlaying) {
                this.isPlaying = true;
                if (this.onPlaybackStart) {
                    this.onPlaybackStart();
                }
            }
            
            // Store reference
            this.currentSource = source;
            
            // Start playback immediately
            source.start(0);
        });
    }
    
    _wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    stop() {
        // Stop current playback
        if (this.currentSource) {
            try {
                this.currentSource.stop();
            } catch (e) {
                // Ignore if already stopped
            }
            this.currentSource = null;
        }
        
        // Clear queue
        this.audioQueue = [];
        this.isProcessingQueue = false;
        this.isPlaying = false;
        
        console.log('Audio playback stopped');
    }
    
    cleanup() {
        // Stop playback
        this.stop();
        
        // Close audio context
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
        }
        
        // Clear references
        this.audioContext = null;
        
        console.log('AudioPlayer cleaned up');
    }
    
    _base64ToArrayBuffer(base64) {
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        return bytes.buffer;
    }
    
    _pcm16ToFloat32(pcm16Array) {
        const float32Array = new Float32Array(pcm16Array.length);
        
        for (let i = 0; i < pcm16Array.length; i++) {
            // Convert Int16 to Float32 (-1 to 1)
            float32Array[i] = pcm16Array[i] / 32768.0;
        }
        
        return float32Array;
    }
    
    isActive() {
        return this.isPlaying || this.audioQueue.length > 0;
    }
    
    getPlaybackState() {
        return {
            isPlaying: this.isPlaying,
            queueLength: this.audioQueue.length,
            isProcessing: this.isProcessingQueue
        };
    }
}

// Export for use in other modules
window.AudioPlayer = AudioPlayer;