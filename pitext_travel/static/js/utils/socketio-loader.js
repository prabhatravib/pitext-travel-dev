// static/js/utils/socketio-loader.js
// Socket.IO loader with CDN fallback

(function loadSocketIO () {
  function trySrc (src, done) {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload  = () => done(typeof io !== 'undefined');
    s.onerror = () => done(false);
    document.head.appendChild(s);
  }
  trySrc('/socket.io/socket.io.js', ok => {
    if (ok) return console.log('[IO] loaded locally');
    console.warn('[IO] local failed – trying CDN');
    trySrc('https://cdn.socket.io/4.7.4/socket.io.min.js', ok2 => {
      if (!ok2) {
        console.error('[IO] failed everywhere – voice disabled');
        const voiceBtn = document.getElementById('voice-button');
        if (voiceBtn) voiceBtn.style.display = 'none';
      } else console.log('[IO] loaded from CDN');
    });
  });
})();