/**
 * Chat Taiksu Widget (embed-safe com suporte a texto, imagem, audio e documento)
 */
(function () {
  const DEFAULTS = {
    serverUrl: "http://localhost:3000",
    roomId: "",
    userId: "",
    title: "Chat de Atendimento",
    position: "bottom-right",
    width: 380,
    height: 620,
    zIndex: 2147483000,
    autoOpen: false,
    authToken: "",
    placeholder: "Digite sua mensagem..."
  };

  let config = { ...DEFAULTS };
  let host = null;
  let shadow = null;
  let widgetOpen = false;
  let eventSource = null;
  let reconnectTimer = null;
  let typingTimer = null;
  let typingActive = false;
  let selectedUploadType = "";
  const renderedIds = new Set();

  function normalizePosition(position) {
    return position === "bottom-left" ? "bottom-left" : "bottom-right";
  }

  function buildApiUrl(path) {
    const base = String(config.serverUrl || "").replace(/\/+$/, "");
    const token = config.authToken ? `?token=${encodeURIComponent(config.authToken)}` : "";
    return `${base}${path}${token}`;
  }

  function setupHost() {
    if (host) return;
    host = document.createElement("div");
    host.id = "taiksu-widget-host";
    host.style.position = "fixed";
    host.style.bottom = "16px";
    host.style[config.position === "bottom-left" ? "left" : "right"] = "16px";
    host.style.zIndex = String(config.zIndex);
    host.style.all = "initial";
    shadow = host.attachShadow({ mode: "open" });
    document.body.appendChild(host);
  }

  function styles() {
    return `
      :host { all: initial; }
      * { box-sizing: border-box; }
      .tw-root { font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif; color: #0f172a; line-height: 1.2; }
      .tw-toggle { width: 58px; height: 58px; border: 0; border-radius: 999px; background: linear-gradient(135deg,#059669 0%,#047857 100%); color:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 12px 26px rgba(0,0,0,.2); }
      .tw-widget { width:min(${Math.max(320, Number(config.width) || 380)}px,calc(100vw - 24px)); height:min(${Math.max(460, Number(config.height) || 620)}px,calc(100vh - 24px)); background:#fff; border-radius:16px; border:1px solid #e2e8f0; box-shadow:0 22px 50px rgba(0,0,0,.22); overflow:hidden; display:flex; flex-direction:column; }
      .tw-header { background:linear-gradient(135deg,#059669 0%,#047857 100%); color:#fff; display:flex; align-items:center; justify-content:space-between; padding:12px 14px; }
      .tw-title { margin:0; font-size:15px; font-weight:700; }
      .tw-close { width:28px; height:28px; border-radius:8px; border:0; background:rgba(255,255,255,.18); color:#fff; cursor:pointer; font-size:18px; line-height:1; }
      .tw-messages { flex:1; overflow-y:auto; padding:12px; background:#e2e8f0; }
      .tw-message { display:flex; margin-bottom:10px; align-items:flex-end; gap:8px; }
      .tw-message.own { justify-content:flex-end; }
      .tw-message-row { max-width:80%; display:flex; flex-direction:column; }
      .tw-message.own .tw-message-row { align-items:flex-end; }
      .tw-avatar { width:28px; height:28px; border-radius:9999px; overflow:hidden; background:#059669; color:#fff; font-size:12px; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
      .tw-message.own .tw-avatar { order:2; background:#047857; }
      .tw-avatar img { width:100%; height:100%; object-fit:cover; display:block; }
      .tw-name { font-size:12px; color:#475569; margin-bottom:4px; font-weight:600; }
      .tw-bubble { border-radius:14px; border:1px solid #cbd5e1; background:#e5e7eb; color:#1f2937; padding:8px 10px; font-size:14px; line-height:1.35; word-break:break-word; }
      .tw-message.own .tw-bubble { background:#047857; border-color:#065f46; color:#fff; }
      .tw-time { margin-top:4px; font-size:11px; color:#64748b; }
      .tw-media.image { max-width:220px; width:100%; border-radius:10px; border:1px solid rgba(148,163,184,.4); display:block; }
      .tw-media.audio { width:230px; max-width:100%; }
      .tw-file-link { color:inherit; font-weight:600; text-decoration:underline; word-break:break-all; }
      .tw-typing { min-height:22px; padding:0 12px 8px; font-size:12px; color:#64748b; font-style:italic; }
      .tw-input-area { border-top:1px solid #e2e8f0; background:#fff; padding:10px; display:flex; gap:8px; align-items:flex-end; position:relative; }
      .tw-attach, .tw-send { width:40px; height:40px; border:0; border-radius:10px; background:#059669; color:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center; }
      .tw-send[disabled] { opacity:.45; cursor:default; }
      .tw-attach-menu { position:absolute; left:10px; bottom:58px; min-width:156px; background:#fff; border:1px solid #dbe3ef; border-radius:10px; box-shadow:0 10px 24px rgba(15,23,42,.18); overflow:hidden; display:none; }
      .tw-attach-menu.show { display:block; }
      .tw-attach-opt { width:100%; border:0; background:transparent; text-align:left; padding:9px 11px; font:inherit; font-size:13px; color:#334155; cursor:pointer; }
      .tw-attach-opt:hover { background:#f1f5f9; }
      .tw-input { flex:1; min-height:40px; max-height:110px; resize:none; border:1px solid #cbd5e1; border-radius:12px; padding:9px 10px; font:inherit; font-size:14px; outline:none; }
      .tw-input:focus { border-color:#10b981; box-shadow:0 0 0 3px rgba(16,185,129,.15); }
      @media (max-width:520px){ .tw-widget{ width:calc(100vw - 12px); height:calc(100vh - 12px); border-radius:14px; } }
    `;
  }

  function renderClosed() {
    shadow.innerHTML = `
      <style>${styles()}</style>
      <div class="tw-root">
        <button class="tw-toggle" id="tw-toggle-btn" title="Abrir chat" aria-label="Abrir chat">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>
        </button>
      </div>
    `;
    shadow.getElementById("tw-toggle-btn").addEventListener("click", openWidget);
  }

  function renderOpen() {
    shadow.innerHTML = `
      <style>${styles()}</style>
      <div class="tw-root">
        <div class="tw-widget">
          <div class="tw-header">
            <h3 class="tw-title">${escapeHtml(config.title)}</h3>
            <button class="tw-close" id="tw-close-btn" aria-label="Fechar chat">×</button>
          </div>
          <div class="tw-messages" id="tw-messages"></div>
          <div class="tw-typing" id="tw-typing"></div>
          <div class="tw-input-area">
            <button class="tw-attach" id="tw-attach-btn" aria-label="Anexar arquivo" title="Anexar arquivo">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"></path></svg>
            </button>
            <div class="tw-attach-menu" id="tw-attach-menu">
              <button class="tw-attach-opt" data-type="image">Foto</button>
              <button class="tw-attach-opt" data-type="audio">Audio</button>
              <button class="tw-attach-opt" data-type="document">Documento</button>
            </div>
            <input type="file" id="tw-file-input" hidden />
            <textarea class="tw-input" id="tw-input" placeholder="${escapeHtml(config.placeholder)}"></textarea>
            <button class="tw-send" id="tw-send-btn" aria-label="Enviar mensagem" disabled>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M3 11.5L21 3l-5.8 18-3.4-6.5L3 11.5zM10.8 13.8l2.2 4.3 3.3-10.1-8.6 4.1 3.1 1.7z"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;

    shadow.getElementById("tw-close-btn").addEventListener("click", closeWidget);
    shadow.getElementById("tw-send-btn").addEventListener("click", sendMessage);
    shadow.getElementById("tw-attach-btn").addEventListener("click", toggleAttachMenu);
    shadow.getElementById("tw-file-input").addEventListener("change", onFileSelected);
    shadow.querySelectorAll(".tw-attach-opt").forEach((btn) => btn.addEventListener("click", onAttachOptionClick));

    shadow.addEventListener("click", (event) => {
      const menu = shadow.getElementById("tw-attach-menu");
      const attachBtn = shadow.getElementById("tw-attach-btn");
      if (!menu || !attachBtn) return;
      const path = event.composedPath ? event.composedPath() : [];
      if (!path.includes(menu) && !path.includes(attachBtn)) menu.classList.remove("show");
    });

    const input = shadow.getElementById("tw-input");
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    });
    input.addEventListener("input", onInputTyping);
  }

  function init(options) {
    config = { ...DEFAULTS, ...(options || {}) };
    config.position = normalizePosition(config.position);
    if (!config.roomId) {
      console.error("TaiksuChat: roomId é obrigatório.");
      return;
    }
    setupHost();
    if (config.autoOpen) openWidget();
    else renderClosed();
  }

  function openWidget() {
    widgetOpen = true;
    renderOpen();
    loadMessages();
    connectSSE();
  }

  function closeWidget() {
    widgetOpen = false;
    closeSSE();
    renderClosed();
  }

  function closeSSE() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function connectSSE() {
    closeSSE();
    eventSource = new EventSource(buildApiUrl(`/api/messages/stream/${encodeURIComponent(config.roomId)}`), { withCredentials: true });
    eventSource.onmessage = (event) => {
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch (_) {
        return;
      }
      if (!payload) return;
      if (payload.type === "new_message") {
        addMessage(payload.message);
        scrollToBottom();
      } else if (payload.type === "typing_status") {
        renderTyping(payload);
      }
    };
    eventSource.onerror = () => {
      closeSSE();
      reconnectTimer = setTimeout(() => { if (widgetOpen) connectSSE(); }, 2500);
    };
  }

  function loadMessages() {
    fetch(buildApiUrl(`/api/messages/${encodeURIComponent(config.roomId)}`), { method: "GET", credentials: "include" })
      .then((res) => res.json())
      .then((messages) => {
        renderedIds.clear();
        const container = shadow.getElementById("tw-messages");
        if (!container) return;
        container.innerHTML = "";
        (messages || []).forEach(addMessage);
        scrollToBottom();
      })
      .catch((err) => console.error("TaiksuChat: erro ao carregar mensagens:", err));
  }

  function normalizeMessage(message) {
    if (!message) return null;
    return {
      ...message,
      id: message.id,
      user_id: message.user_id ?? message.userId,
      content: String(message.content || ""),
      created_at: message.created_at ?? message.createdAt ?? new Date().toISOString(),
      name: message.name || "Usuario",
      avatar: message.avatar || "",
      type: message.type || "text",
      file_url: message.file_url ?? message.fileUrl ?? "",
      file_type: message.file_type ?? message.fileType ?? ""
    };
  }

  function inferFileType(mime) {
    if (!mime) return "document";
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("audio/")) return "audio";
    return "document";
  }

  function resolveMediaUrl(fileUrl) {
    if (!fileUrl) return "";
    if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
    const base = String(config.serverUrl || "").replace(/\/+$/, "");
    return fileUrl.startsWith("/") ? `${base}${fileUrl}` : `${base}/${fileUrl}`;
  }

  function renderMessageBody(message) {
    if (message.type === "text") return `<div class="tw-bubble">${escapeHtml(message.content)}</div>`;
    const mediaUrl = resolveMediaUrl(message.file_url);
    if (!mediaUrl) return `<div class="tw-bubble">Arquivo sem URL</div>`;
    if (message.type === "image") return `<div class="tw-bubble"><img class="tw-media image" src="${escapeAttr(mediaUrl)}" alt="Imagem"></div>`;
    if (message.type === "audio") return `<div class="tw-bubble"><audio class="tw-media audio" controls preload="metadata" src="${escapeAttr(mediaUrl)}"></audio></div>`;
    return `<div class="tw-bubble"><a class="tw-file-link" href="${escapeAttr(mediaUrl)}" download>Documento</a></div>`;
  }

  function addMessage(rawMessage) {
    const message = normalizeMessage(rawMessage);
    if (!message) return;
    if (message.id && renderedIds.has(String(message.id))) return;
    if (message.id) renderedIds.add(String(message.id));

    const container = shadow.getElementById("tw-messages");
    if (!container) return;

    const own = String(message.user_id) === String(config.userId);
    const sender = own ? "Voce" : message.name;
    const time = new Date(message.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    const row = document.createElement("div");
    row.className = `tw-message ${own ? "own" : ""}`;
    row.innerHTML = `
      <div class="tw-avatar">${renderAvatar(message.avatar, message.name)}</div>
      <div class="tw-message-row">
        <div class="tw-name">${escapeHtml(sender)}</div>
        ${renderMessageBody(message)}
        <div class="tw-time">${time}</div>
      </div>
    `;
    container.appendChild(row);
  }

  function sendMessage() {
    const input = shadow.getElementById("tw-input");
    if (!input) return;
    const content = input.value.trim();
    if (!content) return;

    const form = new FormData();
    form.append("roomId", config.roomId);
    form.append("content", content);
    form.append("type", "text");

    fetch(buildApiUrl("/api/messages/send"), { method: "POST", credentials: "include", body: form })
      .then((res) => res.json())
      .then((data) => {
        if (!data || !data.success) return;
        input.value = "";
        const sendBtn = shadow.getElementById("tw-send-btn");
        if (sendBtn) sendBtn.disabled = true;
        if (typingTimer) clearTimeout(typingTimer);
        typingActive = false;
        postTyping(false);
      })
      .catch((err) => console.error("TaiksuChat: erro ao enviar mensagem:", err));
  }

  function sendFile(file, type) {
    if (!file) return;
    const form = new FormData();
    form.append("roomId", config.roomId);
    form.append("file", file);
    form.append("type", type || inferFileType(file.type));
    fetch(buildApiUrl("/api/messages/send"), { method: "POST", credentials: "include", body: form })
      .catch((err) => console.error("TaiksuChat: erro ao enviar arquivo:", err));
  }

  function toggleAttachMenu() {
    const menu = shadow.getElementById("tw-attach-menu");
    if (menu) menu.classList.toggle("show");
  }

  function onAttachOptionClick(event) {
    const type = event.currentTarget.getAttribute("data-type");
    selectedUploadType = type || "";
    const input = shadow.getElementById("tw-file-input");
    const menu = shadow.getElementById("tw-attach-menu");
    if (!input) return;
    const acceptByType = {
      image: "image/*",
      audio: "audio/*",
      document: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
    };
    input.value = "";
    input.accept = acceptByType[selectedUploadType] || "*/*";
    if (menu) menu.classList.remove("show");
    input.click();
  }

  function onFileSelected(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    sendFile(file, selectedUploadType || inferFileType(file.type));
    selectedUploadType = "";
  }

  function onInputTyping() {
    const input = shadow.getElementById("tw-input");
    const sendBtn = shadow.getElementById("tw-send-btn");
    const hasText = input && input.value.trim().length > 0;
    if (sendBtn) sendBtn.disabled = !hasText;
    if (!typingActive) {
      typingActive = true;
      postTyping(true);
    }
    if (typingTimer) clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      typingActive = false;
      postTyping(false);
    }, 1200);
  }

  function postTyping(isTyping) {
    fetch(buildApiUrl(`/api/messages/typing/${encodeURIComponent(config.roomId)}`), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isTyping })
    }).catch(() => {});
  }

  function renderTyping(data) {
    const typingEl = shadow.getElementById("tw-typing");
    if (!typingEl) return;
    if (String(data.userId) === String(config.userId)) return;
    typingEl.innerHTML = data.isTyping ? `${escapeHtml(data.userName || "Usuario")} esta digitando...` : "";
  }

  function scrollToBottom() {
    const container = shadow.getElementById("tw-messages");
    if (container) container.scrollTop = container.scrollHeight;
  }

  function renderAvatar(avatarUrl, name) {
    if (avatarUrl) {
      return `<img src="${escapeAttr(resolveMediaUrl(avatarUrl))}" alt="Avatar de ${escapeAttr(name || "Usuario")}">`;
    }
    const initial = String(name || "U").trim().charAt(0).toUpperCase() || "U";
    return escapeHtml(initial);
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = String(text || "");
    return div.innerHTML;
  }

  function escapeAttr(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function destroy() {
    closeSSE();
    if (host && host.parentNode) host.parentNode.removeChild(host);
    host = null;
    shadow = null;
    widgetOpen = false;
    renderedIds.clear();
  }

  const api = { init, open: openWidget, close: closeWidget, sendMessage, destroy };
  if (typeof window !== "undefined") window.TaiksuChat = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
