// static/js/realtime/audio_player.js
// Audio playback for TTS from Realtime API

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
        
        // Playback state
        this.nextStartTime = 0;
        this.baseTime = 0;
        
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
        
        console.log('[AudioPlayer] Received audio data, size:', arrayBuffer.byteLength);
        
        // Check if it's WAV format (OpenAI sends WAV)
        const dataView = new DataView(arrayBuffer);
        const isWav = dataView.getUint32(0, false) === 0x52494646; // "RIFF"
        
        if (isWav) {
            // Decode WAV using Web Audio API
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            console.log('[AudioPlayer] Decoded WAV audio, duration:', audioBuffer.duration);
            this._queueAudioBuffer(audioBuffer);
        } else {
            // Assume PCM16 format
            const pcm16Array = new Int16Array(arrayBuffer);
            const float32Array = this._pcm16ToFloat32(pcm16Array);
            
            // Create audio buffer
            const audioBuffer = this.audioContext.createBuffer(
                this.channelCount,
                float32Array.length,
                this.sampleRate
            );
            
            // Copy data to buffer
            audioBuffer.copyToChannel(float32Array, 0);
            console.log('[AudioPlayer] Created PCM audio buffer, duration:', audioBuffer.duration);
            
            // Queue for playback
            this._queueAudioBuffer(audioBuffer);
        }
        
    } catch (error) {
        console.error('Failed to play audio:', error);
        if (this.onError) {
            this.onError(error);
        }
    }
} 
    _queueAudioBuffer(audioBuffer) {
        const currentTime = this.audioContext.currentTime;
        
        // Initialize timing if this is the first buffer
        if (this.nextStartTime === 0) {
            this.baseTime = currentTime;
            this.nextStartTime = currentTime + 0.1; // Small delay to prevent glitches
        }
        
        // Create buffer source
        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.audioContext.destination);
        
        // Schedule playback
        source.start(this.nextStartTime);
        
        // Update next start time
        this.nextStartTime += audioBuffer.duration;
        
        // Handle playback events
        source.onended = () => {
            if (!this.isPlaying) {
                if (this.onPlaybackEnd) {
                    this.onPlaybackEnd();
                }
            }
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
    }
    
    stop() {
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
        this.nextStartTime = 0;
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
    
    getPlaybackTime() {
        if (!this.audioContext || !this.isPlaying) {
            return 0;
        }
        
        return this.audioContext.currentTime - this.baseTime;
    }
    
    isActive() {
        return this.isPlaying;
    }
}

// Export for use in other modules
window.AudioPlayer = AudioPlayer;