// static/js/utils/socketio-loader.js
// Socket.IO loader with CDN fallback

(function loadSocketIO () {
  const CDN_SRC = 'https://cdn.socket.io/4.7.4/socket.io.min.js';

  const script = document.createElement('script');
  script.src = CDN_SRC;
  script.async = true;

  script.onload = () => {
    if (typeof io !== 'undefined') {
      console.log('[IO] Socket.IO client loaded from CDN');
    } else {
      console.error('[IO] Socket.IO client failed to initialise');
    }
  };

  script.onerror = () => {
    console.error('[IO] Failed to load Socket.IO client from CDN – voice features disabled');
    const voiceBtn = document.getElementById('voice-button');
    if (voiceBtn) voiceBtn.classList.add('disabled');
  };

  document.head.appendChild(script);
})();