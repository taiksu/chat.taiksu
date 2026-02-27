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
    placeholder: "sua mensagem...",
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
  let headerParticipants = [];
  const selfAliases = new Set();
  let localTypingEchoUntil = 0;
  const renderedIds = new Set();
  let templateCore = (typeof window !== "undefined" && window.ChatTemplateCore) ? window.ChatTemplateCore : null;
  let templateCoreLoader = null;

  const ICONS = {
    expand: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>`,
    compress: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="10" y1="14" x2="3" y2="21"></line></svg>`,
    close: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
    smile: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>`,
    attach: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>`,
    mic: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v1a7 7 0 0 1-14 0v-1"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>`,
    send: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transform: rotate(45deg); margin-left: -2px; margin-top: 2px;"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`,
    stop: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>`,
    doc: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`,
    camera: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>`,
    micAlt: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v1a7 7 0 0 1-14 0v-1"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>`,
    checkDouble: (read) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${read ? "#34b7f1" : "#bbbbbb"}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 13 12 18 22 8"></polyline><polyline points="2 13 7 18 17 8"></polyline></svg>`,
    filePdf: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M9 13v-3h1.5a1.5 1.5 0 0 1 0 3H9z"></path><path d="M12 13h1a2 2 0 0 0 2-2v-1a2 2 0 0 0-2-2h-1v5z"></path></svg>`,
    empty: `<svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`
  };

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

  function ensureTemplateCoreLoaded() {
    if (templateCore) return Promise.resolve(templateCore);
    if (templateCoreLoader) return templateCoreLoader;
    if (typeof document === "undefined") return Promise.resolve(null);

    const script = document.createElement("script");
    script.src = `${String(config.serverUrl || "").replace(/\/+$/, "")}/js/chat-template-core.js`;
    script.async = true;
    templateCoreLoader = new Promise((resolve) => {
      script.onload = () => {
        templateCore = (typeof window !== "undefined" && window.ChatTemplateCore) ? window.ChatTemplateCore : null;
        resolve(templateCore);
      };
      script.onerror = () => resolve(null);
    });
    document.head.appendChild(script);
    return templateCoreLoader;
  }

  function buildApiUrl(path) {
    const base = String(config.serverUrl || "").replace(/\/+$/, "");
    const token = config.authToken ? `?token=${encodeURIComponent(config.authToken)}` : "";
    return `${base}${path}${token}`;
  }

  function getDefaultWidgetParticipants() {
    if (Array.isArray(config.participants) && config.participants.length) {
      return config.participants;
    }
    return [
      { name: String(config.userName || "Atendimento"), avatar: String(config.avatar || ""), status: "online" }
    ];
  }

  function collectParticipantsFromMessages(messages) {
    const source = Array.isArray(messages) ? messages : [];
    const map = new Map();
    source.forEach((raw) => {
      const msg = normalizeMessage(raw);
      if (!msg) return;
      const key = String(msg.user_id || msg.userId || msg.name || "").trim();
      if (!key) return;
      if (!map.has(key)) {
        map.set(key, {
          name: String(msg.name || "Usuario"),
          avatar: String(msg.avatar || ""),
          status: "online"
        });
      } else if (!map.get(key).avatar && msg.avatar) {
        map.get(key).avatar = String(msg.avatar);
      }
    });
    return Array.from(map.values());
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
      .tw-root { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; line-height: 1.2; position: relative; }
      
      .tw-toggle { 
        width: 58px; height: 58px; border: 0; border-radius: 999px; 
        background: linear-gradient(135deg,#075e54 0%,#128c7e 100%); 
        color:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center; 
        box-shadow:0 10px 25px rgba(7, 94, 84, 0.3); transition: transform 0.2s; 
      }
      .tw-toggle:hover { transform: scale(1.05); }
      
      .tw-widget { 
        width: min(${Math.max(320, Number(config.width) || 400)}px, calc(100vw - 24px)); 
        height: min(${Math.max(460, Number(config.height) || 650)}px, calc(100vh - 24px)); 
        background: #e5ddd5; 
        border-radius: 16px; 
        border: 1px solid rgba(0,0,0,0.1); 
        box-shadow: 0 22px 50px rgba(0,0,0,0.22); 
        overflow: hidden; 
        display: flex; 
        flex-direction: column; 
        position: relative;
        transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      }
      
      .tw-widget.expanded {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: min(1200px, calc(100vw - 40px));
        height: calc(100vh - 40px);
        border-radius: 16px;
        z-index: 999999;
      }
      
      .tw-sender-name {
        font-size: 12px;
        font-weight: 800;
        color: #128c7e;
        margin-bottom: 4px;
        text-transform: uppercase;
        letter-spacing: 0.6px;
        display: block;
      }

      .tw-header { background: #075e54; color:#fff; display:flex; align-items:center; justify-content:space-between; padding:16px; position: sticky; top: 0; z-index: 100; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
      .tw-head-main { display:flex; align-items:center; gap:12px; min-width:0; }
      
      /* Avatar Stack */
      .tw-avatar-stack { display: flex; align-items: center; }
      .tw-avatar-item {
        width: 38px; height: 38px; border-radius: 50%; border: 2px solid #075e54;
        background-color: #ddd; overflow: hidden; margin-left: -12px;
        position: relative; transition: transform 0.3s ease;
      }
      .tw-avatar-item:first-child { margin-left: 0; }
      .tw-avatar-item:hover { transform: translateY(-3px); z-index: 10; }
      .tw-avatar-item img { width: 100%; height: 100%; object-fit: cover; }
      .tw-avatar-item span {
        width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
        color: #fff; font-size: 12px; font-weight: 700;
      }
      .tw-avatar-more { background: #262d31; color: white; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold; width: 38px; height: 38px; border-radius: 50%; border: 2px solid #075e54; margin-left: -12px; }

      .tw-head-txt { display:flex; flex-direction:column; gap:2px; min-width:0; margin-left: 4px; }
      .tw-title { margin:0; font-size:14px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .tw-subtitle { font-size:10px; color:#d1fae5; }
      
      .tw-header-btns { display: flex; gap: 4px; }
      .tw-header-btn { width:32px; height:32px; border-radius:9999px; border:0; background:transparent; color:#fff; cursor:pointer; display: flex; align-items: center; justify-content: center; transition: background 0.2s; }
      .tw-header-btn:hover { background: rgba(255,255,255,0.1); }

      .tw-main-content { flex: 1; display:flex; overflow:hidden; position: relative; }

      /* Floating Attach Menu */
      .tw-attach-menu {
        position: absolute; bottom: 85px; left: 16px; width: 55px;
        background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
        display: flex; flex-direction: column; align-items: center; padding: 12px 0; gap: 15px;
        z-index: 60; border-radius: 30px; box-shadow: 0 8px 25px rgba(0,0,0,0.15);
        opacity: 0; transform: translateY(30px) scale(0.5); pointer-events: none;
        transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        border: 1px solid rgba(255,255,255,0.3);
      }
      .tw-attach-menu.open { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }
      .tw-attach-item { display: flex; flex-direction: column; align-items: center; cursor: pointer; transition: transform 0.2s ease; border:0; background:transparent; }
      .tw-attach-item:active { transform: scale(0.8); }
      .tw-attach-circle {
        width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
        color: white; box-shadow: 0 4px 10px rgba(0,0,0,0.1);
      }

      .tw-messages { 
        flex:1; overflow-y:auto; padding: 20px 15px; display: flex; flex-direction: column; gap: 8px;
        background-image: url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png');
        background-blend-mode: overlay; background-color: rgba(229, 221, 213, 0.8);
        scroll-behavior: smooth;
      }
      .tw-empty {
        flex: 1; min-height: 100%;
        display: flex; align-items: center; justify-content: center;
        text-align: center; padding: 20px;
      }
      .tw-empty-wrap { display: flex; flex-direction: column; align-items: center; gap: 10px; color: #0f172a; }
      .tw-empty-wrap strong { font-size: 20px; line-height: 1.2; display: block; }
      .tw-empty-wrap p { margin: 0; font-size: 15px; color: #334155; }
      .tw-empty-icon svg { width: 56px; height: 56px; }
      
      .tw-message {
        width: 100%; display: flex; align-items: flex-end; gap: 8px;
        font-size: 15px; position: relative; word-wrap: break-word; line-height: 1.45;
        animation: twMsgIn 0.3s ease-out forwards; opacity: 0;
      }
      .tw-message:not(.grouped) { margin-top: 14px; }
      .tw-message.grouped { margin-top: 2px; }
      @keyframes twMsgIn { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }

      .tw-message.sent { justify-content: flex-end; }
      .tw-message-content { display: flex; flex-direction: column; min-width: 0; max-width: 75%; }
      .tw-message.sent .tw-message-content { align-items: flex-end; }
      .tw-message.received .tw-message-content { align-items: flex-start; }
      .tw-bubble {
        border-radius: 16px; padding: 10px 14px; box-shadow: 0 1px 0.5px rgba(0,0,0,0.13);
        background: #fff; color: #111; border-bottom-left-radius: 4px;
      }
      .tw-message.sent .tw-bubble { background: #dcf8c6; border-bottom-left-radius: 16px; border-bottom-right-radius: 4px; }
      .tw-message.grouped.received .tw-bubble { border-top-left-radius: 4px; }
      .tw-message.grouped.sent .tw-bubble { border-top-right-radius: 4px; }
      .tw-avatar {
        width: 32px; height: 32px; border-radius: 999px; overflow: hidden; flex-shrink: 0;
        border: 2px solid #fff; background: #059669; display: flex; align-items: center; justify-content: center;
      }
      .tw-avatar img { width: 100%; height: 100%; object-fit: cover; }
      .tw-avatar-initial { font-size: 10px; font-weight: 700; color: #fff; }
      .tw-avatar-spacer { width: 32px; flex-shrink: 0; }

      .tw-meta { margin-top: 4px; display: flex; align-items: center; gap: 4px; justify-content: flex-end; padding: 0 4px; }
      .tw-time { font-size: 11px; color: #6b7280; }
      .tw-read { display: inline-flex; align-items: center; }
      .tw-sender-name { font-size: 10px; font-weight: 700; color: #047857; margin-bottom: 4px; text-transform: uppercase; letter-spacing: .35px; }
      .tw-msg-actions { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; }
      .tw-msg-action {
        border: 1px solid #10b981;
        background: #ecfdf5;
        color: #047857;
        border-radius: 999px;
        padding: 6px 10px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .tw-msg-action:hover { background: #d1fae5; }
      .tw-feedback-row { margin-top: 8px; display: flex; align-items: center; gap: 6px; }
      .tw-feedback-btn {
        border: 1px solid #d1d5db;
        background: #fff;
        color: #475569;
        border-radius: 999px;
        padding: 3px 8px;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
      }
      .tw-feedback-btn:hover { background: #f8fafc; }
      .tw-feedback-btn.active.up { border-color: #10b981; color: #047857; background: #ecfdf5; }
      .tw-feedback-btn.active.down { border-color: #f43f5e; color: #be123c; background: #fff1f2; }

      .tw-media.image { max-width: 100%; border-radius: 12px; display: block; cursor: pointer; margin: 4px 0; }
      .tw-file-link { color: #075e54; font-weight: 600; text-decoration: none; display: flex; align-items: center; gap: 8px; background: rgba(0,0,0,0.05); padding: 8px; border-radius: 8px; }
      .tw-missing-msg {
        display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 10px;
        background: #f3f4f6; color: #6b7280; font-size: 12px; font-weight: 700; text-transform: lowercase;
      }

      .tw-input-area { background: #f3f4f6; padding: 14px 16px; position: relative; border-top: 1px solid rgba(0,0,0,0.05); z-index: 20; }
      .tw-input-area.hidden { display: none; }
      .tw-input-row { display: flex; align-items: center; gap: 10px; }
      .tw-input {
        flex: 1; background: #e5e7eb; border-radius: 20px; padding: 13px 16px; outline: none; border: none;
        font-size: 15px; transition: background 0.2s, box-shadow 0.2s; resize: none; overflow: hidden; line-height: 1.35; color: #374151;
      }
      .tw-input::placeholder { color: #6b7280; }
      .tw-input:focus { background: #eef2f7; box-shadow: 0 0 0 2px rgba(16,185,129,0.2); }
      .tw-icon-btn {
        width: 48px; height: 48px; border-radius: 999px; border:0; cursor:pointer; transition: all 0.2s;
        background:#ecfdf5; color:#059669; padding:0; display:flex; align-items:center; justify-content:center;
      }
      .tw-icon-btn:hover { background:#d1fae5; transform: translateY(-1px); }
      #tw-emoji-btn { background: #ecfdf5; color: #059669; }
      #tw-attach-btn { background: #d1fae5; color: #059669; }

      .tw-action-btn {
        width: 45px; height: 45px; background: #059669; border-radius: 999px; border:0; color:#fff; cursor:pointer;
        display:flex; align-items:center; justify-content:center; box-shadow:0 4px 10px rgba(0,0,0,0.1); transition: all 0.2s;
      }
      .tw-action-btn:hover { background: #065f46; }
      .tw-action-btn:active { transform: scale(0.9); }
      .tw-action-btn.pulse { animation: twPulseMic 1.5s infinite; }
      @keyframes twPulseMic {
        0% { box-shadow: 0 0 0 0 rgba(7, 94, 84, 0.4); }
        70% { box-shadow: 0 0 0 10px rgba(7, 94, 84, 0); }
        100% { box-shadow: 0 0 0 0 rgba(7, 94, 84, 0); }
      }

      /* Emoji Picker v2 */
      .tw-emoji-picker {
        position: absolute; bottom: 85px; left: 16px; background: white; border-radius: 18px; 
        box-shadow: 0 12px 40px rgba(0,0,0,0.2); width: 280px; max-height: 350px; overflow-y: auto; 
        z-index: 70; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); transform-origin: bottom left; padding: 10px;
        opacity: 0; transform: scale(0.5); pointer-events: none;
      }
      .tw-emoji-picker.show { opacity: 1; transform: scale(1); pointer-events: auto; }
      .tw-emoji-section-title { font-size: 11px; font-weight: 700; color: #075e54; text-transform: uppercase; padding: 8px 8px 4px 8px; letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px; }
      .tw-emoji-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
      .tw-emoji-item { font-size: 22px; padding: 6px; cursor: pointer; text-align: center; border-radius: 8px; transition: transform 0.15s, background 0.2s; }
      .tw-emoji-item:hover { transform: scale(1.25); background: #f0f2f5; }

      .tw-recording-chip {
        position: static; margin-top: 10px; height: 46px;
        background: #fff; border-radius: 23px; display: none; align-items: center; 
        padding: 0 20px; gap: 12px; border: 1px solid #f0f2f5;
        box-shadow: 0 1px 6px rgba(0,0,0,0.05);
      }
      .tw-recording-chip.show { display: flex; animation: twFadeIn 0.2s; }
      @keyframes twFadeIn { from { opacity:0; } to { opacity:1; } }
      .tw-recording-chip strong { font-size: 13px; color: #1f2937; }
      .tw-recording-chip span { width: 10px; height: 10px; border-radius: 50%; background: #ef4444; animation: twBlink 1s infinite; }
      @keyframes twBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

      .tw-typing {
        font-size: 12px; color: #065f46; padding: 6px 14px; font-weight: 700; display: none;
        align-items: center; gap: 4px; background: #ecfdf5; border-top: 1px solid #d1fae5;
      }
      .tw-typing.show { display: flex; }
      .tw-dot { width: 3px; height: 3px; background: currentColor; border-radius: 50%; animation: twDot 1.4s infinite; }
      .tw-dot:nth-child(2) { animation-delay: 0.2s; }
      .tw-dot:nth-child(3) { animation-delay: 0.4s; }
      @keyframes twDot { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }

      .tw-system { font-size: 11px; text-align: center; padding: 4px; display: none; }
      .tw-system.show { display: block; }
      .tw-system.error { color: #ef4444; }
      .tw-closed-footer { background: #fff; border-top: 1px solid rgba(0,0,0,0.05); padding: 12px 14px; }
      .tw-closed-inner { display:flex; align-items:center; gap:10px; border:1px solid #fde68a; background:#fffbeb; color:#78350f; border-radius:14px; padding:10px 12px; }
      .tw-closed-text { display:flex; flex-direction:column; gap:2px; font-size:12px; }
      .tw-closed-text strong { text-transform: uppercase; font-size:11px; letter-spacing:.4px; }

      .tw-lightbox { position: fixed; inset: 0; background: rgba(0,0,0,0.9); z-index: 2000; display: none; flex-direction: column; align-items: center; justify-content: center; padding: 20px; }
      .tw-lightbox.show { display: flex; }
      .tw-lightbox-close { position: absolute; top: 20px; right: 20px; border: 0; background: transparent; color: white; font-size: 32px; cursor: pointer; }
      .tw-lightbox-img {
        width: auto;
        max-width: min(78vw, 980px);
        max-height: 82vh;
        object-fit: contain;
        border-radius: 12px;
        box-shadow: 0 16px 48px rgba(0,0,0,0.45);
      }

      .tw-audio-player { background: rgba(255,255,255,0.8); padding: 8px; border-radius: 12px; display: flex; align-items: center; gap: 10px; min-width: 200px; }
      .tw-audio-toggle { width: 34px; height: 34px; border-radius: 50%; border: 0; background: #075e54; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; }
      .tw-audio-main { flex: 1; display: flex; flex-direction: column; gap: 4px; }
      .tw-audio-wave { height: 4px; background: #ccc; border-radius: 2px; position: relative; }
      .tw-audio-progress { position: absolute; left: 0; top: 0; height: 100%; background: #075e54; border-radius: 2px; width: 0; }
      .tw-audio-dot { position: absolute; right: -6px; top: -4px; width: 12px; height: 12px; background: #075e54; border-radius: 50%; border: 2px solid white; }
      .tw-audio-time { font-size: 10px; color: #555; }

      @media (max-width: 480px) {
        .tw-widget { width: 100vw; height: 100vh; border-radius: 0; }
        .tw-widget.expanded { width: 100vw; height: 100vh; border-radius: 0; max-width: none; }
      }
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

  function renderWidgetHeaderMarkup(participants) {
    const safeParticipants = Array.isArray(participants) && participants.length ? participants : getDefaultWidgetParticipants();
    const visibleParticipants = safeParticipants.slice(0, 3);
    const remainingCount = Math.max(0, safeParticipants.length - visibleParticipants.length);
    const stackHtml = visibleParticipants.map((participant) => {
      const name = String((participant && participant.name) || "Usuario");
      const avatar = String((participant && participant.avatar) || "").trim();
      const fallbackInitial = escapeHtml(name.charAt(0).toUpperCase());
      if (avatar) {
        return `<div class="tw-avatar-item"><img src="${escapeAttr(resolveMediaUrl(avatar))}" alt="${escapeAttr(name)}"></div>`;
      }
      return `<div class="tw-avatar-item"><span>${fallbackInitial}</span></div>`;
    }).join("");
    const headerActionsHtml = `<div style="display:flex;gap:4px"><button class="tw-header-btn" id="tw-expand-btn" title="Expandir/Recolher"><span id="tw-expand-icon">${ICONS.expand}</span></button><button class="tw-header-btn" id="tw-close-btn" title="Fechar chat">${ICONS.close}</button></div>`;
    if (templateCore && typeof templateCore.renderConversationHeader === "function") {
      return templateCore.renderConversationHeader({
        title: config.title,
        subtitle: config.subtitle || `${safeParticipants.length} participantes`,
        participants: safeParticipants,
        actionsHtml: headerActionsHtml,
        avatarLimit: 3,
        titleSize: 18
      });
    }
    return `
      <div class="tw-header">
        <div class="tw-head-main">
          <div class="tw-avatar-stack">
            ${stackHtml || `<div class="tw-avatar-item"><span>A</span></div>`}
            ${remainingCount > 0 ? `<div class="tw-avatar-item tw-avatar-more">+${remainingCount}</div>` : ""}
          </div>
          <div class="tw-head-txt">
            <h3 class="tw-title">${escapeHtml(config.title)}</h3>
            <p class="tw-subtitle">${escapeHtml(config.subtitle || `${safeParticipants.length} participante${safeParticipants.length === 1 ? "" : "s"}`)}</p>
          </div>
        </div>
        <div class="tw-header-btns">
          <button class="tw-header-btn" id="tw-expand-btn" title="Expandir/Recolher"><span id="tw-expand-icon">${ICONS.expand}</span></button>
          <button class="tw-header-btn" id="tw-close-btn" title="Fechar chat">${ICONS.close}</button>
        </div>
      </div>
    `;
  }

  function bindHeaderButtons() {
    const closeBtn = shadow.getElementById("tw-close-btn");
    if (closeBtn) closeBtn.onclick = closeWidget;
    const expandBtn = shadow.getElementById("tw-expand-btn");
    if (expandBtn) expandBtn.onclick = toggleExpand;
  }

  function updateWidgetHeader(participants) {
    headerParticipants = Array.isArray(participants) && participants.length ? participants : getDefaultWidgetParticipants();
    const host = shadow.getElementById("tw-header-host");
    if (!host) return;
    host.innerHTML = renderWidgetHeaderMarkup(headerParticipants);
    bindHeaderButtons();
  }

  function renderOpen() {
    headerParticipants = getDefaultWidgetParticipants();
    const headerMarkup = renderWidgetHeaderMarkup(headerParticipants);

    const composerMarkup = (templateCore && typeof templateCore.renderWidgetComposer === "function")
      ? templateCore.renderWidgetComposer({ placeholder: config.placeholder })
      : `
          <div class="tw-attach-menu" id="tw-attach-menu"></div>
          <div class="tw-emoji-picker" id="tw-emoji-picker"><div id="tw-emoji-recent"></div><div class="tw-emoji-section-title">Todos Emojis</div><div class="tw-emoji-grid" id="tw-emoji-all-grid"></div></div>
          <div class="tw-typing" id="tw-typing"><span>Digitando</span><div class="tw-dot"></div><div class="tw-dot"></div><div class="tw-dot"></div></div>
          <div class="tw-system" id="tw-system-msg"></div>
          <div class="tw-input-area" id="tw-input-area"><div class="tw-input-row"><button class="tw-icon-btn" id="tw-emoji-btn" title="Emojis">${ICONS.smile}</button><button class="tw-icon-btn" id="tw-attach-btn" title="Anexar">${ICONS.attach}</button><textarea class="tw-input" id="tw-input" placeholder="${escapeAttr(config.placeholder)}" rows="1" autocomplete="off"></textarea><button class="tw-action-btn pulse" id="tw-action-btn" title="Enviar"><span id="tw-action-icon">${ICONS.mic}</span></button></div><div class="tw-recording-chip" id="tw-recording-chip"><span class="tw-recording-dot"></span><strong>Gravando audio...</strong></div></div>
          <input type="file" id="tw-file-input" style="display:none;" />
      `;
    shadow.innerHTML = `
      <style>${styles()}</style>
      <div class="tw-root" id="tw-root">
        <div class="tw-widget" id="tw-widget">
          <div id="tw-header-host">${headerMarkup}</div>
          <div class="tw-main-content">
            <div class="tw-messages" id="tw-messages"></div>
          </div>
          ${composerMarkup}
        </div>
        <div class="tw-lightbox" id="tw-lightbox">
          <button class="tw-lightbox-close" id="tw-lightbox-close">&times;</button>
          <img src="" id="tw-lightbox-img" alt="Zoom">
        </div>
      </div>
    `;

    setupEventListeners();
  }

  function setupEventListeners() {
    bindHeaderButtons();

    const actionBtn = shadow.getElementById("tw-action-btn");
    if (actionBtn) actionBtn.addEventListener("click", handleAction);

    const emojiBtn = shadow.getElementById("tw-emoji-btn");
    if (emojiBtn) emojiBtn.addEventListener("click", toggleEmojiPicker);

    const attachBtn = shadow.getElementById("tw-attach-btn");
    if (attachBtn) attachBtn.addEventListener("click", toggleAttachMenu);

    const input = shadow.getElementById("tw-input");
    if (input) {
      input.addEventListener("input", onInputUpdate);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleAction();
        }
      });
    }

    const attachItems = shadow.querySelectorAll(".tw-attach-item");
    attachItems.forEach(item => {
      item.addEventListener("click", () => {
        const type = item.getAttribute("data-type");
        onAttachOptionClick(type);
      });
    });

    const fileInput = shadow.getElementById("tw-file-input");
    if (fileInput) fileInput.addEventListener("change", onFileSelected);

    const messagesArea = shadow.getElementById("tw-messages");
    if (messagesArea) messagesArea.addEventListener("click", closeUIExtras);
    if (messagesArea) {
      messagesArea.addEventListener("click", (event) => {
        const feedbackButton = event.target && event.target.closest(".tw-feedback-btn");
        if (feedbackButton) {
          const messageId = String(feedbackButton.getAttribute("data-feedback-id") || "");
          const value = String(feedbackButton.getAttribute("data-feedback-value") || "");
          if (messageId && (value === "up" || value === "down")) {
            submitFeedback(messageId, value);
          }
          return;
        }
        const actionButton = event.target && event.target.closest(".tw-msg-action");
        if (actionButton) {
          const actionType = String(actionButton.getAttribute("data-action-type") || "");
          const actionUrl = String(actionButton.getAttribute("data-action-url") || "");
          const actionTarget = String(actionButton.getAttribute("data-action-target") || "_blank");
          if (actionType === "open_url" && actionUrl) {
            window.open(actionUrl, actionTarget);
          }
          return;
        }
        const image = event.target && event.target.closest("img.tw-media.image");
        if (!image) return;
        openLightbox(image.getAttribute("src"));
      });
    }

    const lightboxClose = shadow.getElementById("tw-lightbox-close");
    if (lightboxClose) lightboxClose.addEventListener("click", closeLightbox);
    const lightbox = shadow.getElementById("tw-lightbox");
    if (lightbox) {
      lightbox.addEventListener("click", (event) => {
        if (event.target === lightbox) closeLightbox();
      });
    }

    // Inicializar Emoji Picker
    initEmojiPicker();
    
    // Auto-scroll e outros mimos
    scrollToBottom();
  }

  function openLightbox(src) {
    const lightbox = shadow.getElementById("tw-lightbox");
    const img = shadow.getElementById("tw-lightbox-img");
    if (!lightbox || !img || !src) return;
    img.src = src;
    lightbox.classList.add("show");
  }

  function closeLightbox() {
    const lightbox = shadow.getElementById("tw-lightbox");
    const img = shadow.getElementById("tw-lightbox-img");
    if (!lightbox || !img) return;
    lightbox.classList.remove("show");
    img.src = "";
  }

  function toggleExpand() {
    const widget = shadow.getElementById("tw-widget");
    const icon = shadow.getElementById("tw-expand-icon");
    if (!widget || !icon) return;
    
    widget.classList.toggle("expanded");
    if (widget.classList.contains("expanded")) {
      icon.innerHTML = ICONS.compress;
    } else {
      icon.innerHTML = ICONS.expand;
    }
    setTimeout(scrollToBottom, 450); // Ajusta scroll apos animacao
  }

  function toggleEmojiPicker(e) {
    if (e) e.stopPropagation();
    const picker = shadow.getElementById("tw-emoji-picker");
    const menu = shadow.getElementById("tw-side-menu");
    if (!picker) return;
    
    picker.classList.toggle("show");
    if (menu) menu.classList.remove("open");
  }

  function toggleAttachMenu(e) {
    if (e) e.stopPropagation();
    const menu = shadow.getElementById("tw-attach-menu");
    const picker = shadow.getElementById("tw-emoji-picker");
    if (!menu) return;
    
    menu.classList.toggle("open");
    if (picker) picker.classList.remove("show");
  }

  function closeUIExtras() {
    const picker = shadow.getElementById("tw-emoji-picker");
    const menu = shadow.getElementById("tw-attach-menu");
    if (picker) picker.classList.remove("show");
    if (menu) menu.classList.remove("open");
  }

  const EMOJI_STORAGE_KEY = "taiksu_widget_recent_emojis_v1";
  const EMOJI_LIST = (templateCore && Array.isArray(templateCore.EMOJI_LIST) && templateCore.EMOJI_LIST.length)
    ? templateCore.EMOJI_LIST
    : ["\u{1f44b}","\u{1f4ac}","\u{1f4e9}","\u{1f4e8}","\u{1f4de}","\u{1f4f1}","\u{1f4cc}","\u{1f4ce}","\u{1f5c2}\u{fe0f}","\u{1f4c1}","\u{1f4dd}","\u{1f9fe}","\u{1f4ca}","\u{1f4c8}","\u{1f4c9}","\u{1f4b0}","\u{1f4b3}","\u{1f3e6}","\u{1f9ee}","\u{1f4c5}","\u{1f5d3}\u{fe0f}","\u{23f0}","\u{1f50d}","\u{1f50e}","\u{2699}\u{fe0f}","\u{1f6e0}\u{fe0f}","\u{1f5a5}\u{fe0f}","\u{2328}\u{fe0f}","\u{1f5a8}\u{fe0f}","\u{1f310}","\u{1f517}","\u{1f512}","\u{1f510}","\u{1f6e1}\u{fe0f}","\u{1f511}","\u{26a0}\u{fe0f}","\u{1f6a8}","\u{2757}","\u{2753}","\u{2139}\u{fe0f}","\u{23f3}","\u{1f552}","\u{1f680}","\u{1f504}","\u{267b}\u{fe0f}","\u{1f4e4}","\u{1f4e5}","\u{1f4e6}","\u{1f3f7}\u{fe0f}","\u{1f4cb}","\u{1f4c4}","\u{1f4d1}","\u{1f91d}","\u{1f465}","\u{1f3e2}","\u{1f1e7}\u{1f1f7}","\u{1f64f}","\u{2705}","\u{2714}\u{fe0f}","\u{2611}\u{fe0f}","\u{274c}","\u{1f363}","\u{1f371}","\u{1f962}","\u{1f359}","\u{1f364}","\u{1f35c}","\u{1f35b}","\u{1f35a}","\u{1f358}","\u{1f365}","\u{1f991}","\u{1f41f}","\u{1f420}","\u{1f990}","\u{1f95f}","\u{1f362}","\u{1f361}","\u{1f375}","\u{1fad6}","\u{1f961}","\u{1f960}","\u{1f376}","\u{1f957}","\u{1f34b}","\u{1f336}\u{fe0f}","\u{1f9c2}","\u{1f525}","\u{1f468}\u{200d}\u{1f373}","\u{1f3ee}","\u{1f1ef}\u{1f1f5}"];
  let recentEmojis = [];

  function loadRecentEmojis() {
    if (templateCore && typeof templateCore.loadRecentEmojis === "function") {
      return templateCore.loadRecentEmojis(EMOJI_STORAGE_KEY, EMOJI_LIST, 24);
    }
    try {
      const raw = localStorage.getItem(EMOJI_STORAGE_KEY);
      const parsed = JSON.parse(raw || "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((item) => EMOJI_LIST.includes(item)).slice(0, 24);
    } catch (_err) {
      return [];
    }
  }

  function saveRecentEmojis() {
    if (templateCore && typeof templateCore.saveRecentEmojis === "function") {
      templateCore.saveRecentEmojis(EMOJI_STORAGE_KEY, recentEmojis, 24);
      return;
    }
    try {
      localStorage.setItem(EMOJI_STORAGE_KEY, JSON.stringify(recentEmojis.slice(0, 24)));
    } catch (_err) {
      // noop
    }
  }

  function initEmojiPicker() {
    const allGrid = shadow.getElementById("tw-emoji-all-grid");
    if (!allGrid) return;

    recentEmojis = loadRecentEmojis();
    allGrid.innerHTML = "";

    EMOJI_LIST.forEach(e => {
      const span = createEmojiSpan(e);
      allGrid.appendChild(span);
    });
    updateRecentEmojiGrid();
  }

  function createEmojiSpan(e) {
    const span = document.createElement("span");
    span.className = "tw-emoji-item";
    span.innerText = e;
    span.onclick = (event) => {
      event.stopPropagation();
      const input = shadow.getElementById("tw-input");
      if (input) {
        if (templateCore && typeof templateCore.insertTextAtCursor === "function") {
          templateCore.insertTextAtCursor(input, e);
        } else {
          const start = Number.isInteger(input.selectionStart) ? input.selectionStart : input.value.length;
          const end = Number.isInteger(input.selectionEnd) ? input.selectionEnd : input.value.length;
          input.value = `${input.value.slice(0, start)}${e}${input.value.slice(end)}`;
          const nextPos = start + e.length;
          input.selectionStart = nextPos;
          input.selectionEnd = nextPos;
          input.focus();
        }
        onInputUpdate();
        addToRecent(e);
      }
    };
    return span;
  }

  function addToRecent(emoji) {
    if (templateCore && typeof templateCore.rememberRecentEmoji === "function") {
      recentEmojis = templateCore.rememberRecentEmoji(EMOJI_STORAGE_KEY, emoji, EMOJI_LIST, 24);
      updateRecentEmojiGrid();
      return;
    }
    recentEmojis = recentEmojis.filter(item => item !== emoji);
    recentEmojis.unshift(emoji);
    if (recentEmojis.length > 24) recentEmojis = recentEmojis.slice(0, 24);
    saveRecentEmojis();
    updateRecentEmojiGrid();
  }

  function updateRecentEmojiGrid() {
    const recentDiv = shadow.getElementById("tw-emoji-recent");
    if (!recentDiv) return;
    if (recentEmojis.length === 0) {
      recentDiv.innerHTML = "";
      return;
    }
    recentDiv.innerHTML = `
      <div class="tw-emoji-section-title">Recentes</div>
      <div class="tw-emoji-grid"></div>
    `;
    const grid = recentDiv.querySelector(".tw-emoji-grid");
    recentEmojis.forEach(e => {
      grid.appendChild(createEmojiSpan(e));
    });
  }

  function onInputUpdate() {
    const input = shadow.getElementById("tw-input");
    const icon = shadow.getElementById("tw-action-icon");
    const chip = shadow.getElementById("tw-recording-chip");
    if (!input || !icon) return;
    
    // Auto resize
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 100) + "px";
    
    const val = input.value.trim();
    if (!recording && chip) chip.classList.remove("show");
    if (val.length > 0) {
      icon.innerHTML = ICONS.send;
      const actionBtn = shadow.getElementById("tw-action-btn");
      if (actionBtn) actionBtn.classList.remove("pulse");
      
      if (!typingActive) {
        typingActive = true;
        postTyping(true, "typing");
      }
      if (typingTimer) clearTimeout(typingTimer);
      typingTimer = setTimeout(() => {
        typingActive = false;
        postTyping(false, "idle");
      }, 1500);
    } else {
      icon.innerHTML = ICONS.mic;
      const actionBtn = shadow.getElementById("tw-action-btn");
      if (actionBtn) actionBtn.classList.add("pulse");
      
      if (typingActive) {
        typingActive = true;
        postTyping(false, "idle");
      }
    }
  }

  function handleAction() {
    if (chatClosed) return;
    const input = shadow.getElementById("tw-input");
    if (!input) return;
    
    const val = input.value.trim();
    if (val.length > 0) {
      sendMessage();
      closeUIExtras();
    } else {
      if (recording) stopRecording();
      else startRecording();
    }
  }

  function onAttachOptionClick(type) {
    selectedUploadType = type || "";
    const fileInput = shadow.getElementById("tw-file-input");
    if (!fileInput) return;
    
    const acceptMap = {
      image: "image/*",
      audio: "audio/*",
      document: ".pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
    };
    
    fileInput.accept = acceptMap[type] || "*/*";
    fileInput.click();
    closeUIExtras();
  }
  function init(options) {
    config = { ...DEFAULTS, ...(options || {}) };
    config.position = normalizePosition(config.position);
    config.mode = normalizeMode(config.mode);
    localUserName = String(config.userName || "").trim();
    selfAliases.clear();
    addSelfAlias(config.userId);
    addSelfAlias(config.userName);
    addSelfAlias(localUserName);
    if (!config.userId && config.authToken) {
      config.userId = parseJwtSub(config.authToken);
      addSelfAlias(config.userId);
    }
    if (!config.roomId) {
      console.error("TaiksuChat: roomId é obrigatório.");
      return;
    }
    ensureTemplateCoreLoaded().catch(() => {});
    setupHost();
    if (config.autoOpen) openWidget();
    else renderClosed();
  }

  async function openWidget() {
    widgetOpen = true;
    await ensureTemplateCoreLoaded().catch(() => null);
    renderOpen();
    fetchRoomState();
    connectSSE();
    await bootstrapInitialGreeting();
    loadMessages();
  }

  async function bootstrapInitialGreeting() {
    try {
      await fetch(buildApiUrl(`/api/messages/bootstrap/${encodeURIComponent(config.roomId)}`), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
    } catch (_err) {
      // no-op: falha no bootstrap nao deve quebrar abertura do chat
    }
  }

  function fetchRoomState() {
    fetch(buildApiUrl(`/api/messages/room-state/${encodeURIComponent(config.roomId)}`), {
      method: "GET",
      credentials: "include"
    })
      .then((res) => res.json())
      .then((data) => {
        if (data && data.closed) {
          setComposerDisabled(true, data.reason || "Chat encerrado");
        } else {
          setComposerDisabled(false);
        }
      })
      .catch(() => {});
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
        if (normalized) {
          const merged = headerParticipants
            .concat(collectParticipantsFromMessages([normalized]))
            .reduce((acc, item) => {
              const key = String((item && item.name) || "").trim().toLowerCase();
              if (!key) return acc;
              if (!acc.some((p) => String((p && p.name) || "").trim().toLowerCase() === key)) acc.push(item);
              return acc;
            }, []);
          updateWidgetHeader(merged);
        }
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
      } else if (payload.type === "message_feedback") {
        applyMessageFeedback({
          messageId: payload.messageId,
          value: payload.value
        });
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
        const participantsFromMessages = collectParticipantsFromMessages(messages || []);
        if (participantsFromMessages.length) {
          updateWidgetHeader(participantsFromMessages);
        } else {
          updateWidgetHeader(getDefaultWidgetParticipants());
        }
        (messages || []).forEach(addMessage);
        bindBrokenMediaFallback(container);
        syncEmptyState();
        initAudioPlayers(container);
        markRoomAsRead();
        scrollToBottom();
      })
      .catch((err) => console.error("TaiksuChat: erro ao carregar mensagens:", err));
  }

  function normalizeMessage(message) {
    if (!message) return null;
    let normalizedActions = [];
    if (Array.isArray(message.actions)) {
      normalizedActions = message.actions;
    } else if (typeof message.actions === "string" && message.actions.trim()) {
      try {
        const parsed = JSON.parse(message.actions);
        normalizedActions = Array.isArray(parsed) ? parsed : [];
      } catch (_err) {
        normalizedActions = [];
      }
    }
    return {
      ...message,
      id: message.id,
      user_id: message.user_id ?? message.userId,
      content: String(message.content || ""),
      created_at: message.created_at ?? message.createdAt ?? new Date().toISOString(),
      name: message.name || "Usuario",
      avatar: message.avatar || "",
      sender_role: message.sender_role || message.senderRole || "",
      is_ai: Boolean(message.is_ai ?? message.isAi ?? false),
      type: message.type || "text",
      file_url: message.file_url ?? message.fileUrl ?? "",
      file_type: message.file_type ?? message.fileType ?? "",
      feedback_value: message.feedback_value ?? message.feedbackValue ?? null,
      feedback_at: message.feedback_at ?? message.feedbackAt ?? null,
      feedback_by: message.feedback_by ?? message.feedbackBy ?? null,
      actions: normalizedActions
    };
  }

  function renderMessageActions(message) {
    const actions = Array.isArray(message?.actions) ? message.actions : [];
    if (!actions.length) return "";
    const buttons = actions
      .map((action) => {
        const id = String(action?.id || "").trim();
        const label = String(action?.label || "").trim();
        const type = String(action?.type || "open_url").trim();
        const url = String(action?.url || "").trim();
        const target = String(action?.target || "_blank").trim();
        if (!id || !label) return "";
        return `<button type="button" class="tw-msg-action" data-action-id="${escapeAttr(id)}" data-action-type="${escapeAttr(type)}" data-action-url="${escapeAttr(url)}" data-action-target="${escapeAttr(target)}">${escapeHtml(label)}</button>`;
      })
      .filter(Boolean)
      .join("");
    return buttons ? `<div class="tw-msg-actions">${buttons}</div>` : "";
  }

  function renderMessageFeedback(message) {
    const isAiMessage = Boolean(message?.is_ai) || String(message?.sender_role || "").toLowerCase() === "system";
    if (!isAiMessage) return "";
    if (String(message?.type || "text").toLowerCase() !== "text") return "";
    const messageId = String(message?.id || "").trim();
    if (!messageId) return "";
    const value = String(message?.feedback_value || "").toLowerCase();
    return `
      <div class="tw-feedback-row" data-feedback-for="${escapeAttr(messageId)}">
        <span style="font-size:11px;color:#64748b">Essa resposta ajudou?</span>
        <button type="button" class="tw-feedback-btn up ${value === "up" ? "active up" : ""}" data-feedback-value="up" data-feedback-id="${escapeAttr(messageId)}">👍</button>
        <button type="button" class="tw-feedback-btn down ${value === "down" ? "active down" : ""}" data-feedback-value="down" data-feedback-id="${escapeAttr(messageId)}">👎</button>
      </div>
    `;
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
    if (templateCore && typeof templateCore.renderMessageContent === "function") {
      return templateCore.renderMessageContent({
        message,
        resolveMediaUrl,
        audioRenderer: buildAudioPlayerHtml,
        imageClass: "tw-media image",
        docClass: "tw-file-link",
        docIconHtml: `${ICONS.filePdf} `
      });
    }
    if (message.type === "text") return `${escapeHtml(message.content)}`;
    const mediaUrl = resolveMediaUrl(message.file_url);
    if (!mediaUrl) return `Arquivo sem URL`;
    if (message.type === "image") return `<img class="tw-media image" src="${escapeAttr(mediaUrl)}" alt="Imagem" loading="lazy">`;
    if (message.type === "audio") return buildAudioPlayerHtml(mediaUrl);
    return `<a class="tw-file-link" href="${escapeAttr(mediaUrl)}" download>${ICONS.filePdf} ${escapeHtml(message.filename || "documento.pdf")}</a>`;
  }

  function buildAudioPlayerHtml(mediaUrl) {
    return `
      <div class="tw-audio-player" data-audio-url="${escapeAttr(mediaUrl)}">
        <button type="button" class="tw-audio-toggle" aria-label="Reproduzir audio">
          <span class="tw-audio-icon-play" style="display: flex; align-items: center; justify-content: center;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg>
          </span>
          <span class="tw-audio-icon-pause" style="display:none; align-items: center; justify-content: center;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"></path></svg>
          </span>
        </button>
        <div class="tw-audio-main">
          <div class="tw-audio-wave">
            <div class="tw-audio-progress">
              <span class="tw-audio-dot"></span>
            </div>
          </div>
          <span class="tw-audio-time">00:00</span>
        </div>
        <audio preload="auto" class="tw-native-audio" style="display:none" src="${escapeAttr(mediaUrl)}"></audio>
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

    const msgUserId = String(message.user_id || message.userId || "").trim();
    const cfgUserId = String(config.userId || "").trim();
    const msgName = String(message.name || "").trim();
    const cfgName = localUserName.trim();

    let own = false;
    if (cfgUserId && msgUserId && cfgUserId === msgUserId) {
      own = true;
    } else if (cfgName && msgName && cfgName === msgName) {
      own = true;
    }

    if (own && !config.userId && msgUserId) {
      config.userId = msgUserId;
    }
    if (own) {
      addSelfAlias(msgUserId);
      addSelfAlias(msgName);
      if (msgName) localUserName = msgName;
    }
    
    const time = (templateCore && typeof templateCore.formatTimePtBr === "function") ? templateCore.formatTimePtBr(message.created_at) : new Date(message.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const isRead = Number(message.is_read) === 1;
    
    // Grouping logic for Gemini v2
    const messages = container.querySelectorAll(".tw-message");
    const previousMessage = messages.length > 0 ? messages[messages.length - 1] : null;
    let isGrouped = false;

    if (previousMessage) {
      const prevId = previousMessage.getAttribute("data-sender-id");
      const currentId = msgUserId || msgName;
      if (prevId === currentId) {
        isGrouped = true;
      }
    }

    const avatarHtml = (!own && !isGrouped)
      ? `<div class="tw-avatar" title="${escapeAttr(msgName)}">${message.avatar ? `<img src="${escapeAttr(resolveMediaUrl(message.avatar))}" alt="${escapeAttr(msgName)}">` : `<span class="tw-avatar-initial">${escapeHtml((msgName || "U").charAt(0).toUpperCase())}</span>`}</div>`
      : (!own ? '<div class="tw-avatar-spacer"></div>' : '');

    const bubbleHtml = `${renderMessageBody(message)}${renderMessageActions(message)}${renderMessageFeedback(message)}`;
    const rowHtml = (templateCore && typeof templateCore.renderWidgetMessageRow === "function")
      ? templateCore.renderWidgetMessageRow({
          own,
          grouped: isGrouped,
          senderName: firstName(message.name),
          ownLabel: "VOCÊ",
          showOwnName: true,
          avatarHtml,
          timeStr: time,
          bubbleHtml,
          checkHtml: ICONS.checkDouble(isRead),
          messageId: String(message.id || ""),
          senderId: msgUserId || msgName
        })
      : `
        <div class="tw-message ${own ? "sent" : "received"} ${isGrouped ? "grouped" : ""}" data-sender-id="${escapeAttr(msgUserId || msgName)}" ${message.id ? `data-message-id="${escapeAttr(String(message.id))}"` : ""}>
          ${avatarHtml}
          <div class="tw-message-content">
            ${(!isGrouped && !own) ? `<div class="tw-sender-name">${escapeHtml(firstName(message.name))}</div>` : ""}
            <div class="tw-bubble">${bubbleHtml}</div>
            <div class="tw-meta">
              <span class="tw-time">${time}</span>
              ${own ? `<span class="tw-read" data-read-for="${escapeAttr(String(message.id || ""))}">${ICONS.checkDouble(isRead)}</span>` : ""}
            </div>
          </div>
        </div>
      `;
    container.insertAdjacentHTML("beforeend", rowHtml);
    bindBrokenMediaFallback(container);
    syncEmptyState();
    setTimeout(() => initAudioPlayers(container), 50);
    scrollToBottom();
  }

  function applyReadReceipts(messageIds) {
    if (!Array.isArray(messageIds) || !messageIds.length) return;
    messageIds.forEach((id) => {
      const receiptEl = shadow && shadow.querySelector(`[data-read-for="${String(id)}"]`);
      if (!receiptEl) return;
      receiptEl.classList.add("read");
      receiptEl.innerHTML = ICONS.checkDouble(true);
      receiptEl.setAttribute("title", "Lido");
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
          <div class="tw-empty-icon">${ICONS.empty}</div>
          <strong>Nenhuma mensagem ainda</strong>
          <p>Comece a conversa abaixo!</p>
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
    const emojiBtn = shadow && shadow.getElementById("tw-emoji-btn");
    const actionBtn = shadow && shadow.getElementById("tw-action-btn");
    const inputArea = shadow && shadow.getElementById("tw-input-area");
    const closedFooter = shadow && shadow.getElementById("tw-closed-footer");
    const closedReason = shadow && shadow.getElementById("tw-closed-reason");
    const disabledState = Boolean(disabled);

    if (input) {
      input.disabled = disabledState;
      input.placeholder = disabledState
        ? "Chat fechado para novas mensagens"
        : String(config.placeholder || DEFAULTS.placeholder);
    }
    if (attachBtn) attachBtn.disabled = disabledState;
    if (emojiBtn) emojiBtn.disabled = disabledState;
    if (actionBtn) actionBtn.disabled = disabledState;
    if (inputArea) inputArea.classList.toggle("hidden", disabledState);
    if (closedFooter) closedFooter.style.display = disabledState ? "block" : "none";
    if (closedReason && disabledState) {
      closedReason.textContent = reason || "Apenas leitura do historico";
    }
    if (disabledState && recording) {
      stopRecording();
    }
    chatClosed = disabledState;
    showSystemMessage(disabledState ? "" : reason || "", disabledState ? "warn" : "warn");
  }

  function handleChatClosedResponse(data) {
    const code = data && data.code ? String(data.code) : "";
    if (code !== "chat_closed") return false;
    setComposerDisabled(true, data?.error || "Este chamado foi fechado. Voce pode visualizar o historico, mas nao pode enviar novas mensagens.");
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

    // Desativa temporariamente para evitar double-click
    const actionBtn = shadow.getElementById("tw-action-btn");
    if (actionBtn) actionBtn.disabled = true;

    fetch(buildApiUrl("/api/messages/send"), { method: "POST", credentials: "include", body: form })
      .then((res) => res.json())
      .then((data) => {
        if (!data || !data.success) {
          if (handleChatClosedResponse(data)) return;
          showSystemMessage("Não foi possível enviar a mensagem agora.", "error");
          return;
        }
        input.value = "";
        input.style.height = "auto";
        onInputUpdate(); // Reseta o ícone para microfone
        
        if (!config.userId && data.message && (data.message.user_id || data.message.userId)) {
          config.userId = String(data.message.user_id || data.message.userId);
        }
        showSystemMessage("");
      })
      .catch((err) => {
        console.error("TaiksuChat: erro ao enviar:", err);
        showSystemMessage("Erro de conexão.", "error");
      })
      .finally(() => {
        if (actionBtn) actionBtn.disabled = false;
      });
  }

  function sendFile(file, type) {
    if (!file || chatClosed) return;
    showSystemMessage("Enviando arquivo...");
    
    const form = new FormData();
    form.append("roomId", config.roomId);
    form.append("file", file);
    form.append("type", type || inferFileType(file.type));
    form.append("filename", file.name);
    form.append("filesize", file.size);

    fetch(buildApiUrl("/api/messages/send"), { method: "POST", credentials: "include", body: form })
      .then((res) => res.json())
      .then((data) => {
        if (!data || !data.success) {
          if (handleChatClosedResponse(data)) return;
          showSystemMessage("Não foi possível enviar o arquivo.", "error");
          return;
        }
        showSystemMessage("");
      })
      .catch((err) => {
        console.error("TaiksuChat: erro ao enviar arquivo:", err);
        showSystemMessage("Erro ao enviar arquivo.", "error");
      });
  }


  function onAttachOptionClick(inputValue) {
    const type = (typeof inputValue === "string")
      ? inputValue
      : inputValue && inputValue.currentTarget
        ? inputValue.currentTarget.getAttribute("data-type")
        : "";
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
    if (menu) menu.classList.remove("open");
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
    if (isTyping) {
      localTypingEchoUntil = Date.now() + 2200;
    }
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
    const chip = shadow.getElementById("tw-recording-chip");
    if (!typingEl) return;
    if (data && data.isTyping && Date.now() < localTypingEchoUntil) {
      typingEl.classList.remove("show");
      return;
    }
    if (recording) {
      typingEl.classList.remove("show");
      return;
    }

    // Nao mostrar para si mesmo (id ou nome)
    const msgUserId = normalizeAlias(data.userId);
    const msgUserName = normalizeAlias(data.userName);
    if (
      (msgUserId && selfAliases.has(msgUserId)) ||
      (msgUserName && selfAliases.has(msgUserName)) ||
      (msgUserName && normalizeAlias(localUserName) === msgUserName)
    ) {
      typingEl.classList.remove("show");
      return;
    }

    if (!data.isTyping) {
      typingEl.classList.remove("show");
      if (!recording && chip) chip.classList.remove("show");
      return;
    }

    const dots = `<span class="tw-dot"></span><span class="tw-dot"></span><span class="tw-dot"></span>`;
    const activity = data.activity === "recording" ? "esta gravando audio" : "esta digitando";
    if (!recording && chip) chip.classList.remove("show");
    typingEl.innerHTML = `<strong>${escapeHtml(data.userName || "Alguem")}</strong> ${activity}... ${dots}`;
    typingEl.classList.add("show");
  }

  function scrollToBottom() {
    const container = shadow.getElementById("tw-messages");
    if (container) {
      container.scrollTop = container.scrollHeight;
      // Scroll extra for safety
      setTimeout(() => { container.scrollTop = container.scrollHeight; }, 50);
    }
  }

  function formatAudioTime(seconds) {
    if (!Number.isFinite(seconds)) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  function applyMessageFeedback({ messageId, value }) {
    const row = shadow && shadow.querySelector(`.tw-feedback-row[data-feedback-for="${String(messageId)}"]`);
    if (!row) return;
    const up = row.querySelector('.tw-feedback-btn.up');
    const down = row.querySelector('.tw-feedback-btn.down');
    if (up) up.classList.remove('active', 'up');
    if (down) down.classList.remove('active', 'down');
    if (value === 'up' && up) up.classList.add('active', 'up');
    if (value === 'down' && down) down.classList.add('active', 'down');
  }

  function submitFeedback(messageId, value) {
    fetch(buildApiUrl(`/api/messages/${encodeURIComponent(messageId)}/feedback`), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value })
    })
      .then((res) => res.json())
      .then((data) => {
        if (!data || !data.success) return;
        applyMessageFeedback({ messageId, value });
      })
      .catch(() => {});
  }

  async function resolveAudioForPlayback(audio, player) {
    if (!audio) return;
    if (audio.dataset.resolved === "1") return;
    const originalSrc = player?.getAttribute("data-audio-url") || audio.getAttribute("src") || "";
    if (!originalSrc) return;

    const maxAttempts = 8;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const stamp = `play_retry=${Date.now()}_${attempt}`;
      const trialUrl = originalSrc.includes("?") ? `${originalSrc}&${stamp}` : `${originalSrc}?${stamp}`;
      try {
        // Avoid fetch() for cross-origin media to prevent CORS blocking in embeds.
        audio.src = trialUrl;
        audio.load();
        audio.dataset.resolved = "1";
        return;
      } catch (_err) {
        await new Promise((resolve) => setTimeout(resolve, 350 + (attempt * 300)));
      }
    }
    throw new Error("audio_unavailable");
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
      const progressEl = player.querySelector(".tw-audio-progress");
      const progressDot = player.querySelector(".tw-audio-dot");
      if (!audio || !toggle) return;

      const sync = () => {
        const duration = audio.duration;
        const hasDuration = Number.isFinite(duration) && duration > 0;
        const ratio = hasDuration ? Math.max(0, Math.min(1, audio.currentTime / duration)) : 0;
        
        if (progressEl) progressEl.style.width = `${ratio * 100}%`;
        if (progressDot) progressDot.style.left = "auto";
        
        if (timeEl) {
          const displayTime = (!audio.paused && audio.currentTime > 0) ? audio.currentTime : (hasDuration ? duration : 0);
          timeEl.textContent = formatAudioTime(displayTime);
        }

        if (audio.paused) {
          if (playIcon) playIcon.style.display = "inline-block";
          if (pauseIcon) pauseIcon.style.display = "none";
        } else {
          if (playIcon) playIcon.style.display = "none";
          if (pauseIcon) pauseIcon.style.display = "inline-block";
        }
      };

      toggle.addEventListener("click", () => {
        if (currentAudio && currentAudio !== audio) {
          currentAudio.pause();
        }
        if (audio.paused) {
          if (timeEl) timeEl.textContent = "carregando...";
          resolveAudioForPlayback(audio, player)
            .then(() => audio.play())
            .then(() => {
              currentAudio = audio;
            })
            .catch(() => {
              if (timeEl) timeEl.textContent = "mensagem apagada";
              const bubble = player.closest(".tw-bubble");
              if (bubble) bubble.innerHTML = `<span class="tw-missing-msg">mensagem apagada</span>`;
            });
        } else {
          audio.pause();
        }
      });

      audio.addEventListener("loadedmetadata", sync);
      audio.addEventListener("error", () => {
        const baseUrl = player.getAttribute("data-audio-url") || audio.getAttribute("src") || "";
        const retryCount = Number(player.getAttribute("data-audio-retry") || "0");
        if (retryCount < 6 && baseUrl) {
          player.setAttribute("data-audio-retry", String(retryCount + 1));
          if (timeEl) timeEl.textContent = "processando...";
          const delayMs = 700 + (retryCount * 500);
          setTimeout(() => {
            const bust = `retry=${Date.now()}`;
            const nextUrl = baseUrl.includes("?") ? `${baseUrl}&${bust}` : `${baseUrl}?${bust}`;
            audio.src = nextUrl;
            audio.load();
          }, delayMs);
          return;
        }
        const bubble = player.closest(".tw-bubble");
        if (!bubble) return;
        bubble.innerHTML = `<span class="tw-missing-msg">Aquivo não disponível</span>`;
      });
      audio.addEventListener("timeupdate", sync);
      audio.addEventListener("play", sync);
      audio.addEventListener("pause", sync);
      audio.addEventListener("ended", () => { sync(); currentAudio = null; });
      sync();
    });
  }

  function bindBrokenMediaFallback(root) {
    const container = root || shadow;
    if (!container) return;
    container.querySelectorAll("img.tw-media.image:not([data-missing-bound='1'])").forEach((img) => {
      img.setAttribute("data-missing-bound", "1");
      img.addEventListener("error", () => {
        const bubble = img.closest(".tw-bubble");
        if (!bubble) return;
        bubble.innerHTML = `<span class="tw-missing-msg">mensagem apagada</span>`;
      });
    });
  }

  function startRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showSystemMessage("Seu navegador não suporta gravação de áudio.", "error");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        mediaStream = stream;
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunks.push(e.data);
        };
        mediaRecorder.onstop = () => {
          const blob = new Blob(audioChunks, { type: "audio/ogg; codecs=opus" });
          const file = new File([blob], "audio_message.ogg", { type: "audio/ogg" });
          sendFile(file, "audio");
          if (mediaStream) mediaStream.getTracks().forEach((t) => t.stop());
          mediaStream = null;
          mediaRecorder = null;
          audioChunks = [];
          updateRecordingUI(false);
          postTyping(false, "idle");
        };
        mediaRecorder.start();
        recording = true;
        updateRecordingUI(true);
        postTyping(true, "recording");
      })
      .catch((err) => {
        console.error("TaiksuChat: erro ao acessar microfone:", err);
        showSystemMessage("Acesso ao microfone negado.", "error");
      });
  }

  function stopRecording() {
    if (!recording) return;
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    } else {
      recording = false;
      updateRecordingUI(false);
      postTyping(false, "idle");
    }
  }

  function updateRecordingUI(active) {
    const chip = shadow.getElementById("tw-recording-chip");
    const btn = shadow.getElementById("tw-action-btn");
    const icon = shadow.getElementById("tw-action-icon");
    const typingEl = shadow.getElementById("tw-typing");
    if (chip) chip.classList.toggle("show", active);
    if (btn) btn.classList.toggle("recording", active);
    if (icon) icon.innerHTML = active ? ICONS.stop : ICONS.mic;
    if (active && typingEl) typingEl.classList.remove("show");
    if (!active) onInputUpdate(); // Restore icon if needed
  }

  function normalizeAlias(value) {
    return String(value || "").trim().toLowerCase();
  }

  function firstName(value) {
    const full = String(value || "").trim();
    if (!full) return "Usuario";
    return full.split(/\s+/)[0] || full;
  }

  function addSelfAlias(value) {
    const alias = normalizeAlias(value);
    if (!alias) return;
    selfAliases.add(alias);
  }

  function renderAvatar(avatarUrl, name) {
    if (avatarUrl) {
      return `<img src="${escapeAttr(resolveMediaUrl(avatarUrl))}" alt="Avatar">`;
    }
    const initial = String(name || "U").trim().charAt(0).toUpperCase();
    return escapeHtml(initial);
  }

  function escapeHtml(text) {
    if (templateCore && typeof templateCore.escapeHtml === "function") {
      return templateCore.escapeHtml(text);
    }
    const div = document.createElement("div");
    div.textContent = String(text || "");
    return div.innerHTML;
  }

  function escapeAttr(value) {
    if (templateCore && typeof templateCore.escapeAttr === "function") {
      return templateCore.escapeAttr(value);
    }
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
      if (document.visibilityState === "visible") markRoomAsRead();
    });
  }

  if (typeof window !== "undefined") {
    window.addEventListener("focus", markRoomAsRead);
  }

  const api = { init, open: openWidget, close: closeWidget, sendMessage, destroy };
  if (typeof window !== "undefined") window.TaiksuChat = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
