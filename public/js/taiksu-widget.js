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
      
      .tw-message { 
        max-width: 80%; padding: 10px 14px; border-radius: 16px; font-size: 14.5px; position: relative; 
        box-shadow: 0 2px 4px rgba(0,0,0,0.05); word-wrap: break-word; line-height: 1.4;
        animation: twMsgIn 0.3s ease-out forwards; opacity: 0;
      }
      .tw-message:not(.grouped) { margin-top: 14px; }
      .tw-message.grouped { margin-top: 2px; }
      @keyframes twMsgIn { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
      
      .tw-message.received { align-self: flex-start; background-color: #ffffff; border-bottom-left-radius: 4px; color: #111; }
      .tw-message.sent { align-self: flex-end; background-color: #dcf8c6; border-bottom-right-radius: 4px; color: #111; }
      
      .tw-message.grouped.received { border-top-left-radius: 4px; }
      .tw-message.grouped.sent { border-top-right-radius: 4px; }

      .tw-meta { margin-top: 4px; display: flex; align-items: center; gap: 4px; justify-content: flex-end; }
      .tw-time { font-size: 10px; color: #888; }
      .tw-read { display: inline-flex; align-items: center; }

      .tw-media.image { max-width: 100%; border-radius: 12px; display: block; cursor: pointer; margin: 4px 0; }
      .tw-file-link { color: #075e54; font-weight: 600; text-decoration: none; display: flex; align-items: center; gap: 8px; background: rgba(0,0,0,0.05); padding: 8px; border-radius: 8px; }

      .tw-input-area { background: #ffffff; padding: 12px 16px; position: relative; border-top: 1px solid rgba(0,0,0,0.05); z-index: 20; }
      .tw-input-row { display: flex; align-items: center; gap: 12px; }
      .tw-input { 
        flex: 1; background: #f0f2f5; border-radius: 22px; padding: 10px 18px; outline: none; border: none; 
        font-size: 15px; transition: background 0.2s; resize: none; overflow: hidden;
      }
      .tw-input:focus { background: #e8eaed; }
      .tw-icon-btn { color: #9ca3af; cursor: pointer; transition: all 0.2s; border:0; background:transparent; padding:4px; display:flex; align-items:center; justify-content:center; }
      .tw-icon-btn:hover { color: #075e54; transform: scale(1.1); }

      .tw-action-btn { 
        width: 44px; height: 44px; background: #075e54; border-radius: 999px; border:0; color:#fff; cursor:pointer; 
        display:flex; align-items:center; justify-content:center; box-shadow:0 4px 10px rgba(0,0,0,0.1); transition: all 0.2s;
      }
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
        position: absolute; left: 16px; right: 16px; bottom: 12px; height: 46px; 
        background: #fff; border-radius: 23px; display: none; align-items: center; 
        padding: 0 20px; gap: 12px; border: 1px solid #f0f2f5; z-index: 30; 
        box-shadow: 0 -2px 10px rgba(0,0,0,0.05);
      }
      .tw-recording-chip.show { display: flex; animation: twFadeIn 0.2s; }
      @keyframes twFadeIn { from { opacity:0; } to { opacity:1; } }
      .tw-recording-chip strong { font-size: 13px; color: #1f2937; }
      .tw-recording-chip span { width: 10px; height: 10px; border-radius: 50%; background: #ef4444; animation: twBlink 1s infinite; }
      @keyframes twBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

      .tw-typing { font-size: 11px; color: #075e54; padding: 4px 16px; font-weight: 600; display: none; }
      .tw-typing.show { display: flex; align-items: center; gap: 4px; }
      .tw-dot { width: 3px; height: 3px; background: currentColor; border-radius: 50%; animation: twDot 1.4s infinite; }
      .tw-dot:nth-child(2) { animation-delay: 0.2s; }
      .tw-dot:nth-child(3) { animation-delay: 0.4s; }
      @keyframes twDot { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }

      .tw-system { font-size: 11px; text-align: center; padding: 4px; display: none; }
      .tw-system.show { display: block; }
      .tw-system.error { color: #ef4444; }

      .tw-lightbox { position: fixed; inset: 0; background: rgba(0,0,0,0.9); z-index: 2000; display: none; flex-direction: column; align-items: center; justify-content: center; padding: 20px; }
      .tw-lightbox.show { display: flex; }
      .tw-lightbox-close { position: absolute; top: 20px; right: 20px; border: 0; background: transparent; color: white; font-size: 32px; cursor: pointer; }
      .tw-lightbox-img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 8px; }

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

  function renderOpen() {
    shadow.innerHTML = `
      <style>${styles()}</style>
      <div class="tw-root" id="tw-root">
        <div class="tw-widget" id="tw-widget">
          <div class="tw-header">
            <div class="tw-head-main">
              <div class="tw-avatar-stack">
                <div class="tw-avatar-item">
                  <img src="${escapeAttr(config.avatar || "https://i.pravatar.cc/100?u=1")}" alt="P1">
                </div>
                <div class="tw-avatar-item">
                  <img src="https://i.pravatar.cc/100?u=2" alt="P2">
                </div>
                <div class="tw-avatar-item tw-avatar-more">+2</div>
              </div>
              <div class="tw-head-txt">
                <h3 class="tw-title">${escapeHtml(config.title)}</h3>
                <p class="tw-subtitle">4 participantes</p>
              </div>
            </div>
            <div class="tw-header-btns">
              <button class="tw-header-btn" id="tw-expand-btn" title="Expandir/Recolher">
                <span id="tw-expand-icon">${ICONS.expand}</span>
              </button>
              <button class="tw-header-btn" id="tw-close-btn" title="Fechar chat">${ICONS.close}</button>
            </div>
          </div>
          
          <div class="tw-main-content">
            <!-- Menu de Anexo Flutuante -->
            <div class="tw-attach-menu" id="tw-attach-menu">
              <button class="tw-attach-item" data-type="document" title="Documento">
                <div class="tw-attach-circle" style="background: #6366f1;">${ICONS.doc}</div>
              </button>
              <button class="tw-attach-item" data-type="image" title="Mídia">
                <div class="tw-attach-circle" style="background: #ec4899;">${ICONS.camera}</div>
              </button>
              <button class="tw-attach-item" data-type="audio" title="Áudio">
                <div class="tw-attach-circle" style="background: #f97316;">${ICONS.micAlt}</div>
              </button>
            </div>

            <!-- Area de Mensagens -->
            <div class="tw-messages" id="tw-messages">
              <!-- Mensagens serao injetadas aqui -->
            </div>
          </div>

          <!-- Emoji Picker -->
          <div class="tw-emoji-picker" id="tw-emoji-picker">
             <!-- Seção de Recentes (via JS) -->
             <div id="tw-emoji-recent"></div>
             <div class="tw-emoji-section-title">Todos Emojis</div>
             <div class="tw-emoji-grid" id="tw-emoji-all-grid"></div>
          </div>

          <!-- Digitando... -->
          <div class="tw-typing" id="tw-typing">
            <span>Digitando</span>
            <div class="tw-dot"></div><div class="tw-dot"></div><div class="tw-dot"></div>
          </div>

          <!-- Mensagens de Sistema -->
          <div class="tw-system" id="tw-system-msg"></div>

          <!-- Area de Input -->
          <div class="tw-input-area" id="tw-input-area">
            <div class="tw-input-row">
              <button class="tw-icon-btn" id="tw-emoji-btn" title="Emojis">${ICONS.smile}</button>
              <button class="tw-icon-btn" id="tw-attach-btn" title="Anexar">${ICONS.attach}</button>
              <textarea class="tw-input" id="tw-input" placeholder="${escapeAttr(config.placeholder)}" rows="1" autocomplete="off"></textarea>
              <button class="tw-action-btn pulse" id="tw-action-btn" title="Enviar">
                <span id="tw-action-icon">${ICONS.mic}</span>
              </button>
            </div>
            
            <div class="tw-recording-chip" id="tw-recording-chip">
              <span class="tw-recording-dot"></span>
              <strong>Gravando áudio...</strong>
            </div>
          </div>
          <input type="file" id="tw-file-input" style="display:none;" />
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
    const closeBtn = shadow.getElementById("tw-close-btn");
    if (closeBtn) closeBtn.addEventListener("click", closeWidget);

    const expandBtn = shadow.getElementById("tw-expand-btn");
    if (expandBtn) expandBtn.addEventListener("click", toggleExpand);

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

    // Inicializar Emoji Picker
    initEmojiPicker();
    
    // Auto-scroll e outros mimos
    scrollToBottom();
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
    if (!input || !icon) return;
    
    // Auto resize
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 100) + "px";
    
    const val = input.value.trim();
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
      toggleRecording();
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
    if (!config.userId && config.authToken) {
      config.userId = parseJwtSub(config.authToken);
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
    if (message.type === "text") return `${escapeHtml(message.content)}`;
    const mediaUrl = resolveMediaUrl(message.file_url);
    if (!mediaUrl) return `Arquivo sem URL`;
    if (message.type === "image") return `<img class="tw-media image" src="${escapeAttr(mediaUrl)}" alt="Imagem" loading="lazy">`;
    if (message.type === "audio") return buildAudioPlayerHtml(mediaUrl);
    if (message.type === "document") {
        return `<a class="tw-file-link" href="${escapeAttr(mediaUrl)}" download>
                  ${ICONS.filePdf} ${escapeHtml(message.filename || "documento.pdf")}
                </a>`;
    }
    return escapeHtml(message.content);
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

    const bubbleHtml = renderMessageBody(message);
    const rowHtml = (templateCore && typeof templateCore.renderWidgetMessageRow === "function")
      ? templateCore.renderWidgetMessageRow({
          own,
          grouped: isGrouped,
          senderName: String(message.name || ""),
          timeStr: time,
          bubbleHtml,
          checkHtml: ICONS.checkDouble(isRead),
          messageId: String(message.id || ""),
          senderId: msgUserId || msgName
        })
      : `
        <div class="tw-message ${own ? "sent" : "received"} ${isGrouped ? "grouped" : ""}" data-sender-id="${escapeAttr(msgUserId || msgName)}" ${message.id ? `data-message-id="${escapeAttr(String(message.id))}"` : ""}>
          ${(!isGrouped && !own) ? `<div class="tw-sender-name">${escapeHtml(message.name)}</div>` : ""}
          <div class="tw-bubble">${bubbleHtml}</div>
          <div class="tw-meta">
            <span class="tw-time">${time}</span>
            ${own ? `<span class="tw-read" data-read-for="${escapeAttr(String(message.id || ""))}">${ICONS.checkDouble(isRead)}</span>` : ""}
          </div>
        </div>
      `;
    container.insertAdjacentHTML("beforeend", rowHtml);
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
          <div>
            <strong>Nenhuma mensagem ainda</strong>
            <div>Comece a conversa abaixo!</div>
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
    
    // Nao mostrar para si mesmo
    const msgUserId = String(data.userId || "").trim();
    const cfgUserId = String(config.userId || "").trim();
    if (cfgUserId && msgUserId && cfgUserId === msgUserId) {
      typingEl.classList.remove("show");
      return;
    }

    if (!data.isTyping) {
      typingEl.classList.remove("show");
      return;
    }
    
    const dots = `<span class="tw-dot"></span><span class="tw-dot"></span><span class="tw-dot"></span>`;
    const activity = data.activity === "recording" ? "está gravando áudio" : "está digitando";
    typingEl.innerHTML = `<strong>${escapeHtml(data.userName || "Alguém")}</strong> ${activity}... ${dots}`;
    typingEl.classList.add("show");
  }

  function postTyping(isTyping, activity = "typing") {
    if (chatClosed) return;
    fetch(buildApiUrl(`/api/messages/typing/${encodeURIComponent(config.roomId)}`), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isTyping, activity })
    }).catch(() => {});
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
        const duration = audio.duration;
        const hasDuration = Number.isFinite(duration) && duration > 0;
        const ratio = hasDuration ? Math.max(0, Math.min(1, audio.currentTime / duration)) : 0;
        
        if (progressDot) progressDot.style.left = `${ratio * 100}%`;
        
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
          audio.play();
          currentAudio = audio;
        } else {
          audio.pause();
        }
      });

      audio.addEventListener("loadedmetadata", sync);
      audio.addEventListener("timeupdate", sync);
      audio.addEventListener("play", sync);
      audio.addEventListener("pause", sync);
      audio.addEventListener("ended", () => { sync(); currentAudio = null; });
      sync();
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
    if (chip) chip.classList.toggle("show", active);
    if (btn) btn.classList.toggle("recording", active);
    if (icon) icon.innerHTML = active ? ICONS.stop : ICONS.mic;
    if (!active) onInputUpdate(); // Restore icon if needed
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
