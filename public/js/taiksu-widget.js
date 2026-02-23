/**
 * Chat Taiksu Widget
 * Widget JavaScript embutível para aplicações cliente
 * 
 * Uso:
 * <script src="https://seu-servidor.com/js/taiksu-widget.js"></script>
 * <script>
 *   TaiksuChat.init({
 *     serverUrl: 'https://seu-servidor.com',
 *     roomId: 'id-da-sala',
 *     position: 'bottom-right'
 *   });
 * </script>
 */

const TaiksuChat = (() => {
  let config = {};
  let eventSource = null;
  let widgetOpen = false;

  const styles = `
    .taiksu-widget {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 380px;
      height: 600px;
      border-radius: 12px;
      box-shadow: 0 5px 40px rgba(0, 0, 0, 0.2);
      background: white;
      display: flex;
      flex-direction: column;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      z-index: 9999;
    }

    .taiksu-widget.closed {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      align-items: center;
      justify-content: center;
    }

    .taiksu-toggle {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      cursor: pointer;
      font-size: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      transition: all 0.3s;
      z-index: 9999;
    }

    .taiksu-toggle:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
    }

    .taiksu-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 16px;
      border-radius: 12px 12px 0 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .taiksu-header h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }

    .taiksu-close {
      background: none;
      border: none;
      color: white;
      cursor: pointer;
      font-size: 20px;
    }

    .taiksu-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .taiksu-message {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
      animation: slideIn 0.3s ease;
    }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .taiksu-message.own {
      justify-content: flex-end;
    }

    .taiksu-avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: #667eea;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: bold;
      flex-shrink: 0;
    }

    .taiksu-bubble {
      max-width: 70%;
      padding: 8px 12px;
      border-radius: 8px;
      background: #f0f0f0;
      color: #333;
      font-size: 14px;
      word-wrap: break-word;
      line-height: 1.4;
    }

    .taiksu-message.own .taiksu-bubble {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }

    .taiksu-time {
      font-size: 12px;
      color: #999;
      margin-top: 4px;
      padding: 0 8px;
    }

    .taiksu-input-area {
      padding: 12px;
      border-top: 1px solid #eee;
      display: flex;
      gap: 8px;
      align-items: flex-end;
    }

    .taiksu-input {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
      font-family: inherit;
      resize: none;
      max-height: 80px;
    }

    .taiksu-input:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.1);
    }

    .taiksu-send {
      width: 36px;
      height: 36px;
      padding: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
      transition: all 0.3s;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .taiksu-send:hover {
      transform: scale(1.05);
    }

    .taiksu-typing {
      color: #999;
      font-size: 12px;
      font-style: italic;
      padding: 0 8px;
    }

    @media (max-width: 480px) {
      .taiksu-widget {
        width: 100%;
        height: 100%;
        bottom: 0;
        right: 0;
        border-radius: 0;
        max-width: 100%;
        max-height: 100%;
      }
    }
  `;

  function init(options) {
    config = {
      serverUrl: options.serverUrl || 'http://localhost:3000',
      roomId: options.roomId,
      position: options.position || 'bottom-right',
      title: options.title || 'Suporte',
      autoOpen: options.autoOpen !== false,
      ...options
    };

    if (!config.roomId) {
      console.error('TaiksuChat: roomId é obrigatório');
      return;
    }

    createWidget();
    setupStyles();

    if (config.autoOpen) {
      setTimeout(() => {
        // Não abrir automaticamente, apenas mostrar o botão
      }, 1000);
    }
  }

  function createWidget() {
    // Criar container principal
    const container = document.createElement('div');
    container.id = 'taiksu-container';
    container.innerHTML = `
      <div class="taiksu-widget closed" id="taiksu-widget">
        <button class="taiksu-toggle" id="taiksu-toggle" title="Abrir chat">
          💬
        </button>
      </div>
    `;

    document.body.appendChild(container);

    // Adicionar listeners
    document.getElementById('taiksu-toggle').addEventListener('click', toggleWidget);
  }

  function toggleWidget() {
    const widget = document.getElementById('taiksu-widget');
    const toggle = document.getElementById('taiksu-toggle');

    if (widgetOpen) {
      closeWidget();
    } else {
      openWidget();
    }
  }

  function openWidget() {
    const widget = document.getElementById('taiksu-widget');
    widget.classList.remove('closed');
    widget.innerHTML = `
      <div class="taiksu-header">
        <h3>💬 <%= 'título' %></h3>
        <button class="taiksu-close" onclick="TaiksuChat.closeWidget()">✕</button>
      </div>
      <div class="taiksu-messages" id="taiksu-messages"></div>
      <div id="taiksu-typing-area"></div>
      <div class="taiksu-input-area">
        <input type="text" class="taiksu-input" id="taiksu-input" placeholder="Digite sua mensagem...">
        <button class="taiksu-send" onclick="TaiksuChat.sendMessage()">✈️</button>
      </div>
    `;

    widgetOpen = true;
    loadMessages();
    connectSSE();

    document.getElementById('taiksu-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendMessage();
      }
    });
  }

  function closeWidget() {
    const widget = document.getElementById('taiksu-widget');
    widget.classList.add('closed');
    widget.innerHTML = `
      <button class="taiksu-toggle" id="taiksu-toggle" title="Abrir chat">
        💬
      </button>
    `;

    document.getElementById('taiksu-toggle').addEventListener('click', toggleWidget);

    widgetOpen = false;

    if (eventSource) {
      eventSource.close();
    }
  }

  function loadMessages() {
    fetch(`${config.serverUrl}/api/messages/${config.roomId}`)
      .then(res => res.json())
      .then(messages => {
        const container = document.getElementById('taiksu-messages');
        container.innerHTML = '';

        messages.forEach(msg => {
          addMessageToWidget(msg);
        });

        scrollToBottom();
      })
      .catch(err => console.error('Erro ao carregar mensagens:', err));
  }

  function connectSSE() {
    eventSource = new EventSource(`${config.serverUrl}/api/messages/stream/${config.roomId}`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'new_message') {
        addMessageToWidget(data.message);
        scrollToBottom();
      } else if (data.type === 'typing_status') {
        updateTypingStatus(data);
      }
    };

    eventSource.onerror = () => {
      setTimeout(connectSSE, 3000);
    };
  }

  function addMessageToWidget(message) {
    const container = document.getElementById('taiksu-messages');
    const msgDiv = document.createElement('div');
    msgDiv.className = `taiksu-message ${message.user_id === config.userId ? 'own' : ''}`;

    const time = new Date(message.created_at).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });

    msgDiv.innerHTML = `
      <div>
        <div class="taiksu-bubble">${escapeHtml(message.content)}</div>
        <div class="taiksu-time">${time}</div>
      </div>
    `;

    container.appendChild(msgDiv);
  }

  function sendMessage() {
    const input = document.getElementById('taiksu-input');
    const content = input.value.trim();

    if (!content) return;

    const formData = new FormData();
    formData.append('roomId', config.roomId);
    formData.append('content', content);
    formData.append('type', 'text');

    fetch(`${config.serverUrl}/api/messages/send`, {
      method: 'POST',
      body: formData
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        input.value = '';
      }
    })
    .catch(err => console.error('Erro ao enviar mensagem:', err));
  }

  function scrollToBottom() {
    const container = document.getElementById('taiksu-messages');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }

  function updateTypingStatus(data) {
    const typingArea = document.getElementById('taiksu-typing-area');
    if (data.isTyping) {
      typingArea.innerHTML = `<div class="taiksu-typing">${data.userName} está digitando...</div>`;
    } else {
      typingArea.innerHTML = '';
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function setupStyles() {
    const styleEl = document.createElement('style');
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);
  }

  return {
    init,
    closeWidget: () => closeWidget(),
    sendMessage: () => sendMessage()
  };
})();

// Para uso em navegadores
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TaiksuChat;
}
