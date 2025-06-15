// static/js/chat.js
// Handles voice transcripts and chat interactions

// Chat display for continuous voice interaction
class Chat {
  constructor() {
    this.panel = document.getElementById('chat-panel');
  }
  
  addBubble(role, text) {
    const div = document.createElement('div');
    div.className = `bubble ${role}`;
    
    const formattedText = text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
    
    div.innerHTML = formattedText;
    this.panel.appendChild(div);
    
    this.panel.style.display = 'block';
    
    setTimeout(() => {
      div.scrollIntoView({behavior: 'smooth', block: 'end'});
    }, 100);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.chatInstance = new Chat();
});    
