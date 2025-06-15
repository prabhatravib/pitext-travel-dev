// static/js/voice.js
// Voice input controller with feedback prevention

(function() {
  class VoiceController {
    constructor(buttonSelector = '#mic-btn') {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) {
        console.warn('SpeechRecognition not supported in this browser');
        return;
      }
      // Request microphone permission immediately
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(() => console.log('Microphone permission granted'))
        .catch(err => console.warn('Microphone permission denied:', err));

      this.rec = new SR();
      this.rec.lang = 'en-US';
      this.rec.continuous = false;  // Changed to false to prevent continuous listening
      this.rec.interimResults = false;
      this.isActive = false;
      this.onTranscript = null;
      this.isAssistantSpeaking = false;  // Track assistant speech
      this.lastTranscriptTime = 0;       // Track timing
      
      // Find button
      this.btn = document.querySelector(buttonSelector);
      if (!this.btn) {
        console.warn('Mic button not found');
        return;
      }
      
      this.btn.addEventListener('click', () => {
        if (this.isAssistantSpeaking) {
          console.log('Cannot start recording - assistant is speaking');
          return;
        }
        this.toggle();
      });

      // Handle results
      this.rec.addEventListener('result', e => {
        // Ignore results if assistant is speaking
        if (this.isAssistantSpeaking) {
          console.log('Ignoring transcript - assistant is speaking');
          return;
        }
        
        // Get transcript
        const { transcript } = e.results[e.results.length - 1][0];
        const cleanTranscript = transcript.trim();
        
        // Ignore very short transcripts (likely noise)
        if (cleanTranscript.length < 3) {
          console.log('Ignoring short transcript:', cleanTranscript);
          return;
        }
        
        // Rate limiting - ignore if too soon after last transcript
        const now = Date.now();
        if (now - this.lastTranscriptTime < 2000) {  // 2 second minimum between inputs
          console.log('Rate limiting - too soon after last input');
          return;
        }
        this.lastTranscriptTime = now;
        
        console.log('Processing transcript:', cleanTranscript);
        if (this.onTranscript) {
          this.onTranscript(cleanTranscript);
        }
        
        // Stop recognition after processing
        this.stop();
      });

      // Update button state
      this.rec.addEventListener('start', () => {
        this.btn.classList.add('active');
        this.isActive = true;
        console.log('Voice recognition started');
      });
      
      this.rec.addEventListener('end', () => {
        this.btn.classList.remove('active');
        this.isActive = false;
        console.log('Voice recognition ended');
      });
      
      // Handle errors
      this.rec.addEventListener('error', (e) => {
        console.error('Speech recognition error:', e.error);
        this.btn.classList.remove('active');
        this.isActive = false;
        
        // Common error handling
        if (e.error === 'no-speech') {
          console.log('No speech detected - click mic to try again');
        } else if (e.error === 'audio-capture') {
          console.error('Microphone access denied or unavailable');
        }
      });
      
      // Auto-stop after silence
      this.rec.addEventListener('speechend', () => {
        console.log('Speech ended, stopping recognition');
        this.stop();
      });
    }

    start() {
      if (this.rec && !this.isActive && !this.isAssistantSpeaking) {
        try {
          this.rec.start();
          console.log('Starting voice recognition');
        } catch (e) {
          console.error('Failed to start recognition:', e);
        }
      } else if (this.isAssistantSpeaking) {
        console.log('Cannot start - assistant is speaking');
      }
    }
    
    stop() {
      if (this.rec && this.isActive) {
        try {
          this.rec.stop();
          console.log('Stopping voice recognition');
        } catch (e) {
          console.error('Failed to stop recognition:', e);
        }
      }
    }
    
    toggle() {
      if (this.isAssistantSpeaking) {
        console.log('Cannot toggle - assistant is speaking');
        return;
      }
      this.isActive ? this.stop() : this.start();
    }
    
    // Methods to be called by chat.js
    setAssistantSpeaking(isSpeaking) {
      this.isAssistantSpeaking = isSpeaking;
      if (isSpeaking) {
        this.stop();  // Always stop when assistant starts speaking
        if (this.btn) {
          this.btn.classList.add('disabled');
        }
      } else {
        if (this.btn) {
          this.btn.classList.remove('disabled');
        }
      }
    }
  }

  // Export globally
  window.voice = new VoiceController();
})();