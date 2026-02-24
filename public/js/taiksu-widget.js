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
    userName: "",
    placeholder: "Digite sua mensagem...",
    mode: "floating",
    mountSelector: ""
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
  let mediaRecorder = null;
  let mediaStream = null;
  let audioChunks = [];
  let recording = false;
  let chatClosed = false;
  let currentActivity = "idle";
  let localUserName = "";
  let currentAudio = null;
  const renderedIds = new Set();

  function parseJwtSub(token) {
    try {
      if (!token || String(token).split(".").length < 2) return "";
      const payload = String(token).split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded = payload.padEnd(payload.length + (4 - (payload.length % 4 || 4)) % 4, "=");
      const decoded = JSON.parse(atob(padded));
      return decoded && decoded.sub != null ? String(decoded.sub) : "";
    } catch (_err) {
      return "";
    }
  }

  function normalizePosition(position) {
    return position === "bottom-left" ? "bottom-left" : "bottom-right";
  }

  function normalizeMode(mode) {
    return mode === "inline" ? "inline" : "floating";
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
    if (config.mode === "inline" && config.mountSelector) {
      const mountEl = document.querySelector(config.mountSelector);
      if (mountEl) {
        host.style.position = "relative";
        host.style.zIndex = "1";
        mountEl.appendChild(host);
      } else {
        console.warn(`TaiksuChat: mountSelector nao encontrado: ${config.mountSelector}`);
        host.style.position = "fixed";
        host.style.bottom = "16px";
        host.style[config.position === "bottom-left" ? "left" : "right"] = "16px";
        host.style.zIndex = String(config.zIndex);
        document.body.appendChild(host);
      }
    } else {
      host.style.position = "fixed";
      host.style.bottom = "16px";
      host.style[config.position === "bottom-left" ? "left" : "right"] = "16px";
      host.style.zIndex = String(config.zIndex);
      document.body.appendChild(host);
    }
    shadow = host.attachShadow({ mode: "open" });
  }

  function styles() {
    return `
      :host { all: initial; }
      * { box-sizing: border-box; }
      .tw-root { font-family: "Figtree","Segoe UI",Tahoma,Geneva,Verdana,sans-serif; color: #0f172a; line-height: 1.2; }
      .tw-toggle { width: 58px; height: 58px; border: 0; border-radius: 999px; background: linear-gradient(135deg,#10b981 0%,#047857 100%); color:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 14px 28px rgba(6,78,59,.28); }
      .tw-widget { width:min(${Math.max(320, Number(config.width) || 380)}px,calc(100vw - 24px)); height:min(${Math.max(460, Number(config.height) || 620)}px,calc(100vh - 24px)); background:#fff; border-radius:16px; border:1px solid #e2e8f0; box-shadow:0 22px 50px rgba(0,0,0,.22); overflow:hidden; display:flex; flex-direction:column; }
      .tw-header { background:linear-gradient(135deg,#059669 0%,#047857 100%); color:#fff; display:flex; align-items:center; justify-content:space-between; padding:12px 14px; }
      .tw-head-main { display:flex; align-items:center; gap:10px; min-width:0; }
      .tw-head-icon { width:34px; height:34px; border-radius:9999px; background:rgba(255,255,255,.2); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
      .tw-head-txt { display:flex; flex-direction:column; gap:2px; min-width:0; }
      .tw-title { margin:0; font-size:15px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .tw-subtitle { font-size:11px; color:#d1fae5; display:flex; align-items:center; gap:6px; }
      .tw-online-dot { width:7px; height:7px; border-radius:9999px; background:#34d399; display:inline-block; box-shadow:0 0 0 3px rgba(52,211,153,.18); }
      .tw-close { width:28px; height:28px; border-radius:8px; border:0; background:rgba(255,255,255,.18); color:#fff; cursor:pointer; font-size:18px; line-height:1; }
      .tw-messages { flex:1; overflow-y:auto; padding:12px; background:linear-gradient(180deg,#f9f9f9 0%,#ecfeff 100%); }
      .tw-messages::-webkit-scrollbar { width:8px; }
      .tw-messages::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:999px; }
      .tw-empty { min-height:100%; display:flex; align-items:center; justify-content:center; text-align:center; padding:24px 14px; color:#64748b; font-size:13px; }
      .tw-empty-wrap { display:flex; flex-direction:column; align-items:center; gap:10px; max-width:230px; }
      .tw-empty-icon { width:72px; height:72px; border-radius:9999px; background:linear-gradient(135deg,#d1fae5,#a7f3d0); color:#065f46; display:flex; align-items:center; justify-content:center; box-shadow:inset 0 0 0 1px rgba(16,185,129,.28); }
      .tw-empty strong { color:#065f46; display:block; margin-bottom:6px; }
      .tw-message { display:flex; margin-bottom:10px; align-items:flex-end; gap:8px; }
      .tw-message.own { justify-content:flex-end; }
      .tw-message-row { max-width:80%; display:flex; flex-direction:column; }
      .tw-message.own .tw-message-row { align-items:flex-end; }
      .tw-avatar { width:28px; height:28px; border-radius:9999px; overflow:hidden; background:#059669; color:#fff; font-size:12px; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
      .tw-message.own .tw-avatar { order:2; background:#047857; }
      .tw-avatar img { width:100%; height:100%; object-fit:cover; display:block; }
      .tw-name { font-size:12px; color:#475569; margin-bottom:4px; font-weight:600; }
      .tw-bubble { border-radius:14px; border:1px solid #cbd5e1; background:#f1f5f9; color:#1f2937; padding:8px 10px; font-size:14px; line-height:1.35; word-break:break-word; }
      .tw-message.own .tw-bubble { background:#047857; border-color:#065f46; color:#fff; }
      .tw-time { margin-top:4px; font-size:11px; color:#64748b; }
      .tw-meta { margin-top:4px; display:flex; align-items:center; gap:6px; }
      .tw-message.own .tw-meta { justify-content:flex-end; }
      .tw-read { display:inline-flex; align-items:center; color:#64748b; }
      .tw-read .tw-check-read { display:none; }
      .tw-read.read { color:#0ea5e9; }
      .tw-read.read .tw-check-sent { display:none; }
      .tw-read.read .tw-check-read { display:inline-block; }
      .tw-media.image { max-width:220px; width:100%; border-radius:10px; border:1px solid rgba(148,163,184,.4); display:block; }
      .tw-media.audio { width:230px; max-width:100%; }
      .tw-audio-player { display:flex; align-items:center; gap:8px; width:260px; max-width:100%; background:rgba(255,255,255,.18); border-radius:999px; padding:7px 10px; }
      .tw-audio-toggle { width:30px; height:30px; border:0; border-radius:9999px; background:#fff; color:#065f46; display:flex; align-items:center; justify-content:center; cursor:pointer; }
      .tw-audio-main { min-width:0; flex:1; display:flex; flex-direction:column; gap:3px; }
      .tw-audio-wave { display:flex; align-items:center; min-height:16px; }
      .tw-audio-progress { position:relative; flex:1; height:18px; display:flex; align-items:flex-end; }
      .tw-audio-dot { position:absolute; left:0%; bottom:8px; width:11px; height:11px; border-radius:9999px; background:#38bdf8; box-shadow:0 0 0 2px rgba(56,189,248,.2); transform:translateX(-50%); transition:left .09s linear; z-index:2; }
      .tw-audio-bars { display:flex; flex:1; align-items:flex-end; gap:2px; height:18px; padding-left:7px; }
      .tw-audio-bar { width:3px; border-radius:999px; background:rgba(255,255,255,.95); transform-origin:center bottom; }
      .tw-audio-time { width:auto; text-align:left; font-size:11px; font-weight:700; color:#fff; }
      .tw-audio-player.playing .tw-audio-bar { animation: twEq 0.9s ease-in-out infinite; }
      .tw-audio-player.playing .tw-audio-bar:nth-child(2n) { animation-duration: 1.1s; }
      .tw-audio-player.playing .tw-audio-bar:nth-child(3n) { animation-duration: 0.8s; }
      @keyframes twEq { 0%,100% { transform: scaleY(0.35); } 50% { transform: scaleY(1); } }
      .tw-message:not(.own) .tw-audio-player { background:#c7ded0; }
      .tw-message:not(.own) .tw-audio-toggle { background:#f1f5f9; color:#334155; }
      .tw-message:not(.own) .tw-audio-time { color:#475569; }
      .tw-message:not(.own) .tw-audio-bar { background:#9ca3af; }
      .tw-file-link { color:inherit; font-weight:600; text-decoration:underline; word-break:break-all; }
      .tw-typing { min-height:0; margin:-10px 10px 0; padding:4px 10px; font-size:12px; color:#64748b; font-style:italic; display:flex; align-items:center; gap:6px; background:rgba(248,250,252,.9); border:1px solid rgba(226,232,240,.9); border-radius:10px; width:fit-content; max-width:calc(100% - 20px); }
      .tw-dot { width:6px; height:6px; border-radius:9999px; background:#94a3b8; display:inline-block; animation:twTyping 1.2s infinite ease-in-out; }
      .tw-dot:nth-child(2) { animation-delay:.15s; }
      .tw-dot:nth-child(3) { animation-delay:.3s; }
      @keyframes twTyping { 0%,80%,100% { opacity:.2; transform:translateY(0); } 40% { opacity:1; transform:translateY(-3px); } }
      .tw-input-area { border-top:1px solid #dbe4ee; background:#ffffff; padding:10px; display:flex; gap:8px; align-items:flex-end; position:relative; margin-top:-6px; border-top-left-radius:14px; border-top-right-radius:14px; box-shadow:0 -6px 12px rgba(15,23,42,.04); }
      .tw-compose { flex:1; display:flex; align-items:flex-end; gap:8px; border:1px solid #cbd5e1; border-radius:14px; padding:6px; background:#fff; box-shadow:0 2px 0 rgba(15,23,42,.02); }
      .tw-attach, .tw-send, .tw-mic { width:40px; height:40px; border:0; border-radius:10px; background:#059669; color:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center; }
      .tw-mic.recording { background:#dc2626; }
      .tw-send[disabled] { opacity:.45; cursor:default; }
      .tw-attach-menu { position:absolute; left:10px; bottom:58px; min-width:156px; background:#fff; border:1px solid #dbe3ef; border-radius:10px; box-shadow:0 10px 24px rgba(15,23,42,.18); overflow:hidden; display:none; }
      .tw-attach-menu.show { display:block; }
      .tw-attach-opt { width:100%; border:0; background:transparent; text-align:left; padding:9px 11px; font:inherit; font-size:13px; color:#334155; cursor:pointer; display:flex; align-items:center; gap:8px; }
      .tw-attach-opt:hover { background:#f1f5f9; }
      .tw-input { flex:1; min-height:40px; max-height:110px; resize:none; border:0; border-radius:10px; padding:9px 10px; font:inherit; font-size:14px; outline:none; color:#065f46; }
      .tw-input::placeholder { color:#64748b; }
      .tw-system { min-height:0; margin:4px 10px -2px; padding:0; font-size:12px; color:#64748b; }
      .tw-system.show { background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:7px 9px; }
      .tw-system.error.show { color:#9f1239; border-color:#fecdd3; background:#fff1f2; }
      .tw-system.warn.show { color:#92400e; border-color:#fde68a; background:#fffbeb; }
      .tw-recording-chip { position:absolute; right:60px; bottom:62px; background:#fff1f2; border:1px solid #fecdd3; color:#be123c; font-size:12px; font-weight:600; border-radius:999px; padding:6px 10px; display:none; align-items:center; gap:6px; }
      .tw-recording-chip.show { display:flex; }
      .tw-recording-chip span { width:8px; height:8px; border-radius:999px; background:#ef4444; animation:twRecPulse 1s infinite; }
      @keyframes twRecPulse { 0%,100% { transform:scale(.85); opacity:.7; } 50% { transform:scale(1.2); opacity:1; } }
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
            <div class="tw-head-main">
              <div class="tw-head-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>
              </div>
              <div class="tw-head-txt">
                <h3 class="tw-title">${escapeHtml(config.title)}</h3>
                <div class="tw-subtitle"><span class="tw-online-dot"></span><span>Atendimento online</span></div>
              </div>
            </div>
            <button class="tw-close" id="tw-close-btn" aria-label="Fechar chat">&times;</button>
          </div>
          <div class="tw-messages" id="tw-messages">
            <div class="tw-empty" id="tw-empty">
              <div class="tw-empty-wrap">
                <div class="tw-empty-icon">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>
                </div>
                <div>
                  <strong>Nenhuma mensagem enviada</strong>
                  Envie a primeira mensagem para iniciar o atendimento.
                </div>
              </div>
            </div>
          </div>
          <div class="tw-typing" id="tw-typing"></div>
          <div class="tw-system" id="tw-system-msg"></div>
          <div class="tw-input-area">
            <div class="tw-compose">
              <button class="tw-attach" id="tw-attach-btn" aria-label="Anexar arquivo" title="Anexar arquivo">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"></path></svg>
              </button>
              <div class="tw-attach-menu" id="tw-attach-menu">
                <button class="tw-attach-opt" data-type="image">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 15l-5-5L5 20"/></svg>
                  <span>Foto</span>
                </button>
                <button class="tw-attach-opt" data-type="audio">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                  <span>Audio</span>
                </button>
                <button class="tw-attach-opt" data-type="document">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
                  <span>Documento</span>
                </button>
              </div>
              <input type="file" id="tw-file-input" hidden />
              <textarea class="tw-input" id="tw-input" placeholder="${escapeHtml(config.placeholder)}"></textarea>
              <button class="tw-send" id="tw-send-btn" aria-label="Enviar mensagem" disabled>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M3 11.5L21 3l-5.8 18-3.4-6.5L3 11.5zM10.8 13.8l2.2 4.3 3.3-10.1-8.6 4.1 3.1 1.7z"/></svg>
              </button>
              <button class="tw-mic" id="tw-mic-btn" aria-label="Gravar audio" title="Gravar audio">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="3.5" width="6" height="11" rx="3"></rect><path d="M6.5 11.5a5.5 5.5 0 0 0 11 0"></path><path d="M12 17v3"></path><path d="M9 20h6"></path></svg>
              </button>
            </div>
            <div class="tw-recording-chip" id="tw-recording-chip"><span></span><strong>Gravando audio...</strong></div>
          </div>
        </div>
      </div>
    `;

    shadow.getElementById("tw-close-btn").addEventListener("click", closeWidget);
    shadow.getElementById("tw-send-btn").addEventListener("click", sendMessage);
    shadow.getElementById("tw-mic-btn").addEventListener("click", toggleRecording);
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
    onInputTyping();
    setComposerDisabled(false);
  }
  function init(options) {
    config = { ...DEFAULTS, ...(options || {}) };
    config.position = normalizePosition(config.position);
    config.mode = normalizeMode(config.mode);
    localUserName = String(config.userName || "").trim();
    if (!config.userId && config.authToken) {
      config.userId = parseJwtSub(config.authToken);
    }
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
    stopRecording();
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
        const normalized = normalizeMessage(payload.message);
        addMessage(normalized);
        const isOwnIncoming = normalized && config.userId && String(normalized.user_id) === String(config.userId);
        if (!isOwnIncoming) {
          markRoomAsRead();
        }
        scrollToBottom();
      } else if (payload.type === "typing_status") {
        renderTyping(payload);
      } else if (payload.type === "messages_read") {
        applyReadReceipts(payload.messageIds);
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
        syncEmptyState();
        initAudioPlayers(container);
        markRoomAsRead();
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
    if (message.type === "audio") return `<div class="tw-bubble">${buildAudioPlayerHtml(mediaUrl)}</div>`;
    return `<div class="tw-bubble"><a class="tw-file-link" href="${escapeAttr(mediaUrl)}" download>Documento</a></div>`;
  }

  function buildAudioPlayerHtml(mediaUrl) {
    let bars = "";
    for (let i = 0; i < 26; i += 1) {
      bars += `<span class="tw-audio-bar" style="height:${18 + ((i * 7) % 62)}%"></span>`;
    }
    return `
      <div class="tw-audio-player" data-audio-url="${escapeAttr(mediaUrl)}">
        <button type="button" class="tw-audio-toggle" aria-label="Reproduzir audio">
          <svg class="tw-audio-icon-play" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72a1 1 0 0 0 1.55.83l10-6.86a1 1 0 0 0 0-1.66l-10-6.86A1 1 0 0 0 8 5.14z"/></svg>
          <svg class="tw-audio-icon-pause" style="display:none" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5h3v14H8zm5 0h3v14h-3z"/></svg>
        </button>
        <div class="tw-audio-main">
          <div class="tw-audio-wave">
            <div class="tw-audio-progress">
              <span class="tw-audio-dot"></span>
              <div class="tw-audio-bars">${bars}</div>
            </div>
          </div>
          <span class="tw-audio-time">00:00</span>
        </div>
        <audio preload="metadata" class="tw-native-audio" style="display:none" src="${escapeAttr(mediaUrl)}"></audio>
      </div>
    `;
  }

  function addMessage(rawMessage) {
    const message = normalizeMessage(rawMessage);
    if (!message) return;
    if (message.id && renderedIds.has(String(message.id))) return;
    if (message.id) renderedIds.add(String(message.id));

    const container = shadow.getElementById("tw-messages");
    if (!container) return;

    let own = config.userId ? String(message.user_id) === String(config.userId) : false;
    if (!own && !config.userId && localUserName && String(message.name || "") === localUserName) {
      own = true;
    }
    if (own && !config.userId && message.user_id) {
      config.userId = String(message.user_id);
    }
    const sender = own ? "Voce" : message.name;
    const time = new Date(message.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const readClass = own && Number(message.is_read) === 1 ? "tw-read read" : "tw-read";
    const readLabel = Number(message.is_read) === 1 ? "Lido" : "Enviado";
    const readIconHtml = `
      <span class="tw-check-sent" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8.5l2.2 2.2L9.8 6.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </span>
      <span class="tw-check-read" aria-hidden="true">
        <svg width="16" height="14" viewBox="0 0 20 16" fill="none"><path d="M1.6 8.6l2.4 2.4 4.8-4.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.2 8.6l2.4 2.4 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </span>
    `;

    const row = document.createElement("div");
    row.className = `tw-message ${own ? "own" : ""}`;
    if (message.id) row.setAttribute("data-message-id", String(message.id));
    row.innerHTML = `
      <div class="tw-avatar">${renderAvatar(message.avatar, message.name)}</div>
      <div class="tw-message-row">
        <div class="tw-name">${escapeHtml(sender)}</div>
        ${renderMessageBody(message)}
        <div class="tw-meta">
          <div class="tw-time">${time}</div>
          ${own ? `<div class="${readClass}" data-read-for="${escapeAttr(String(message.id || ""))}" title="${readLabel}" aria-label="${readLabel}">${readIconHtml}</div>` : ""}
        </div>
      </div>
    `;
    container.appendChild(row);
    syncEmptyState();
    initAudioPlayers(container);
  }

  function applyReadReceipts(messageIds) {
    if (!Array.isArray(messageIds) || !messageIds.length) return;
    messageIds.forEach((id) => {
      const receiptEl = shadow && shadow.querySelector(`[data-read-for="${String(id)}"]`);
      if (!receiptEl) return;
      receiptEl.classList.add("read");
      receiptEl.setAttribute("title", "Lido");
      receiptEl.setAttribute("aria-label", "Lido");
    });
  }

  function markRoomAsRead() {
    if (!widgetOpen) return;
    fetch(buildApiUrl(`/api/messages/mark-read/${encodeURIComponent(config.roomId)}`), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    }).catch(() => {});
  }

  function syncEmptyState() {
    const container = shadow && shadow.getElementById("tw-messages");
    if (!container) return;
    const empty = shadow.getElementById("tw-empty");
    const hasMessages = !!container.querySelector(".tw-message");
    if (hasMessages && empty) {
      empty.remove();
      return;
    }
    if (!hasMessages && !empty) {
      const node = document.createElement("div");
      node.className = "tw-empty";
      node.id = "tw-empty";
      node.innerHTML = `
        <div class="tw-empty-wrap">
          <div class="tw-empty-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>
          </div>
          <div>
            <strong>Nenhuma mensagem enviada</strong>
            Envie a primeira mensagem para iniciar o atendimento.
          </div>
        </div>
      `;
      container.appendChild(node);
    }
  }

  function showSystemMessage(text, type = "warn") {
    const el = shadow && shadow.getElementById("tw-system-msg");
    if (!el) return;
    if (!text) {
      el.className = "tw-system";
      el.textContent = "";
      return;
    }
    el.textContent = String(text);
    el.className = `tw-system show ${type}`;
  }

  function setComposerDisabled(disabled, reason = "") {
    const input = shadow && shadow.getElementById("tw-input");
    const attachBtn = shadow && shadow.getElementById("tw-attach-btn");
    const sendBtn = shadow && shadow.getElementById("tw-send-btn");
    const micBtn = shadow && shadow.getElementById("tw-mic-btn");
    const disabledState = Boolean(disabled);

    if (input) {
      input.disabled = disabledState;
      input.placeholder = disabledState
        ? "Chat fechado para novas mensagens"
        : String(config.placeholder || DEFAULTS.placeholder);
    }
    if (attachBtn) attachBtn.disabled = disabledState;
    if (sendBtn) sendBtn.disabled = disabledState || !(input && input.value.trim());
    if (micBtn) micBtn.disabled = disabledState;
    if (disabledState && recording) {
      stopRecording();
    }
    chatClosed = disabledState;
    showSystemMessage(reason || "", disabledState ? "warn" : "warn");
  }

  function handleChatClosedResponse(data) {
    const code = data && data.code ? String(data.code) : "";
    if (code !== "chat_closed") return false;
    setComposerDisabled(true, "Este chamado foi fechado. Voce pode visualizar o historico, mas nao pode enviar novas mensagens.");
    return true;
  }

  function sendMessage() {
    const input = shadow.getElementById("tw-input");
    if (!input) return;
    const content = input.value.trim();
    if (!content) return;
    if (chatClosed) return;

    const form = new FormData();
    form.append("roomId", config.roomId);
    form.append("content", content);
    form.append("type", "text");

    fetch(buildApiUrl("/api/messages/send"), { method: "POST", credentials: "include", body: form })
      .then((res) => res.json())
      .then((data) => {
        if (!data || !data.success) {
          if (handleChatClosedResponse(data)) return;
          showSystemMessage("Nao foi possivel enviar a mensagem agora.", "error");
          return;
        }
        input.value = "";
        if (!config.userId && data.message && (data.message.user_id || data.message.userId)) {
          config.userId = String(data.message.user_id || data.message.userId);
        }
        if (!localUserName && data.message && data.message.name) {
          localUserName = String(data.message.name);
        }
        const sendBtn = shadow.getElementById("tw-send-btn");
        if (sendBtn) sendBtn.disabled = true;
        showSystemMessage("");
        if (typingTimer) clearTimeout(typingTimer);
        typingActive = false;
        postTyping(false, "idle");
        onInputTyping();
      })
      .catch((err) => console.error("TaiksuChat: erro ao enviar mensagem:", err));
  }

  function sendFile(file, type) {
    if (!file) return;
    if (chatClosed) return;
    const form = new FormData();
    form.append("roomId", config.roomId);
    form.append("file", file);
    form.append("type", type || inferFileType(file.type));
    fetch(buildApiUrl("/api/messages/send"), { method: "POST", credentials: "include", body: form })
      .then((res) => res.json())
      .then((data) => {
        if (!data || !data.success) {
          if (handleChatClosedResponse(data)) return;
          showSystemMessage("Nao foi possivel enviar o arquivo.", "error");
          return;
        }
        if (!config.userId && data.message && (data.message.user_id || data.message.userId)) {
          config.userId = String(data.message.user_id || data.message.userId);
        }
        if (!localUserName && data.message && data.message.name) {
          localUserName = String(data.message.name);
        }
        showSystemMessage("");
      })
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
    if (chatClosed) return;
    const input = shadow.getElementById("tw-input");
    if (!input) return;
    const sendBtn = shadow.getElementById("tw-send-btn");
    const micBtn = shadow.getElementById("tw-mic-btn");
    const hasText = input && input.value.trim().length > 0;
    if (sendBtn) sendBtn.disabled = !hasText;
    if (sendBtn && micBtn) {
      sendBtn.style.display = hasText ? "flex" : "none";
      micBtn.style.display = hasText ? "none" : "flex";
    }
    if (!hasText) {
      if (typingActive) {
        typingActive = false;
        postTyping(false, "idle");
      }
      if (typingTimer) {
        clearTimeout(typingTimer);
        typingTimer = null;
      }
      return;
    }
    if (!typingActive || currentActivity !== "typing") {
      typingActive = true;
      postTyping(true, "typing");
    }
    if (typingTimer) clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      typingActive = false;
      postTyping(false, "idle");
    }, 1200);
  }

  function postTyping(isTyping, activity = "typing") {
    if (chatClosed) return;
    currentActivity = isTyping ? activity : "idle";
    fetch(buildApiUrl(`/api/messages/typing/${encodeURIComponent(config.roomId)}`), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isTyping, activity: currentActivity })
    }).catch(() => {});
  }

  function renderTyping(data) {
    const typingEl = shadow.getElementById("tw-typing");
    if (!typingEl) return;
    if (config.userId && String(data.userId) === String(config.userId)) return;
    if (!config.userId && localUserName && String(data.userName || "") === localUserName) return;
    if (!data.isTyping) {
      typingEl.innerHTML = "";
      return;
    }
    const user = escapeHtml(data.userName || "Usuario");
    const activity = String(data.activity || "typing");
    typingEl.innerHTML = activity === "recording"
      ? `<strong>${user}</strong> esta gravando audio <span class="tw-dot"></span><span class="tw-dot"></span><span class="tw-dot"></span>`
      : `<strong>${user}</strong> esta digitando <span class="tw-dot"></span><span class="tw-dot"></span><span class="tw-dot"></span>`;
  }

  function scrollToBottom() {
    const container = shadow.getElementById("tw-messages");
    if (container) container.scrollTop = container.scrollHeight;
  }

  function formatAudioTime(seconds) {
    if (!Number.isFinite(seconds)) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  function initAudioPlayers(root) {
    const container = root || shadow;
    if (!container) return;
    const players = container.querySelectorAll(".tw-audio-player:not([data-init='1'])");
    players.forEach((player) => {
      player.setAttribute("data-init", "1");
      const audio = player.querySelector(".tw-native-audio");
      const toggle = player.querySelector(".tw-audio-toggle");
      const playIcon = player.querySelector(".tw-audio-icon-play");
      const pauseIcon = player.querySelector(".tw-audio-icon-pause");
      const timeEl = player.querySelector(".tw-audio-time");
      const progressDot = player.querySelector(".tw-audio-dot");
      if (!audio || !toggle) return;

      const sync = () => {
        const hasDuration = Number.isFinite(audio.duration) && audio.duration > 0;
        const ratio = hasDuration ? Math.max(0, Math.min(1, (audio.currentTime || 0) / audio.duration)) : 0;
        if (progressDot) {
          progressDot.style.left = `${ratio * 100}%`;
        }
        if (timeEl) {
          if (!audio.paused && audio.currentTime > 0) timeEl.textContent = formatAudioTime(audio.currentTime);
          else if (Number.isFinite(audio.duration) && audio.duration > 0) timeEl.textContent = formatAudioTime(audio.duration);
          else timeEl.textContent = "00:00";
        }
        if (audio.paused) {
          player.classList.remove("playing");
          if (pauseIcon) pauseIcon.style.display = "none";
          if (playIcon) playIcon.style.display = "block";
        } else {
          player.classList.add("playing");
          if (playIcon) playIcon.style.display = "none";
          if (pauseIcon) pauseIcon.style.display = "block";
        }
      };

      toggle.addEventListener("click", async () => {
        if (currentAudio && currentAudio !== audio) currentAudio.pause();
        try {
          if (audio.paused) {
            await audio.play();
            currentAudio = audio;
          } else {
            audio.pause();
          }
        } catch (_) {}
      });

      audio.addEventListener("loadedmetadata", sync);
      audio.addEventListener("timeupdate", sync);
      audio.addEventListener("play", sync);
      audio.addEventListener("pause", sync);
      audio.addEventListener("ended", sync);
      sync();
    });
  }

  async function toggleRecording() {
    const micBtn = shadow.getElementById("tw-mic-btn");
    const recordingChip = shadow.getElementById("tw-recording-chip");
    if (!micBtn) return;
    if (chatClosed) return;

    const setRecordingUI = (active) => {
      recording = Boolean(active);
      micBtn.classList.toggle("recording", recording);
      if (recordingChip) recordingChip.classList.toggle("show", recording);
    };

    if (!recording) {
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(mediaStream);
        audioChunks = [];
        mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) audioChunks.push(event.data);
        };
        mediaRecorder.onstop = () => {
          const blob = new Blob(audioChunks, { type: "audio/webm" });
          if (blob.size > 0) {
            sendAudioBlob(blob);
          }
          if (mediaStream) mediaStream.getTracks().forEach((t) => t.stop());
          mediaStream = null;
          mediaRecorder = null;
          audioChunks = [];
          postTyping(false, "idle");
          setRecordingUI(false);
        };
        mediaRecorder.onerror = () => {
          if (mediaStream) mediaStream.getTracks().forEach((t) => t.stop());
          mediaStream = null;
          mediaRecorder = null;
          audioChunks = [];
          postTyping(false, "idle");
          setRecordingUI(false);
        };
        mediaRecorder.start();
        postTyping(true, "recording");
        setRecordingUI(true);
      } catch (err) {
        console.error("TaiksuChat: erro ao iniciar gravacao:", err);
        postTyping(false, "idle");
        setRecordingUI(false);
      }
      return;
    }

    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
      return;
    }
    postTyping(false, "idle");
    setRecordingUI(false);
  }

  function sendAudioBlob(blob) {
    if (!blob || !blob.size) return;
    if (chatClosed) return;
    const form = new FormData();
    form.append("roomId", config.roomId);
    form.append("file", blob, "audio.webm");
    form.append("type", "audio");
    fetch(buildApiUrl("/api/messages/send"), { method: "POST", credentials: "include", body: form })
      .then((res) => res.json())
      .then((data) => {
        if (!data || !data.success) {
          if (handleChatClosedResponse(data)) return;
          showSystemMessage("Nao foi possivel enviar o audio.", "error");
          console.error("TaiksuChat: falha ao enviar audio", data);
          return;
        }
        if (!config.userId && data.message && (data.message.user_id || data.message.userId)) {
          config.userId = String(data.message.user_id || data.message.userId);
        }
        if (!localUserName && data.message && data.message.name) {
          localUserName = String(data.message.name);
        }
        showSystemMessage("");
      })
      .catch((err) => console.error("TaiksuChat: erro ao enviar audio:", err));
  }

  function stopRecording() {
    recording = false;
    const micBtn = shadow && shadow.getElementById("tw-mic-btn");
    const recordingChip = shadow && shadow.getElementById("tw-recording-chip");
    if (micBtn) micBtn.classList.remove("recording");
    if (recordingChip) recordingChip.classList.remove("show");
    postTyping(false, "idle");
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
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
    stopRecording();
    closeSSE();
    if (host && host.parentNode) host.parentNode.removeChild(host);
    host = null;
    shadow = null;
    widgetOpen = false;
    renderedIds.clear();
  }

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        markRoomAsRead();
      }
    });
  }

  if (typeof window !== "undefined") {
    window.addEventListener("focus", () => {
      markRoomAsRead();
    });
  }

  const api = { init, open: openWidget, close: closeWidget, sendMessage, destroy };
  if (typeof window !== "undefined") window.TaiksuChat = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
