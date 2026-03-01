/**
 * Taiksu Chat Web Component
 * Uso:
 *   <script src="http://127.0.0.1:3000/js/taiksu-widget-component.js"></script>
 *   <taiksu-chat-widget
 *     server-url="http://127.0.0.1:3000"
 *     client-app-id="meu-app"
 *     external-user-id="user-123"
 *     auth-token="SEU_TOKEN"
 *     auto-open="false"
 *   ></taiksu-chat-widget>
 */
(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (customElements.get("taiksu-chat-widget")) return;

  let widgetScriptLoader = null;

  function toBool(value, fallback) {
    if (value == null || value === "") return Boolean(fallback);
    const normalized = String(value).trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "sim";
  }

  function toNumber(value, fallback) {
    if (value == null || value === "") return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function loadScript(src) {
    if (window.TaiksuChat) return Promise.resolve(window.TaiksuChat);
    if (widgetScriptLoader) return widgetScriptLoader;
    widgetScriptLoader = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => resolve(window.TaiksuChat || null);
      script.onerror = () => reject(new Error("Falha ao carregar taiksu-widget.js"));
      document.head.appendChild(script);
    });
    return widgetScriptLoader;
  }

  class TaiksuChatWidgetElement extends HTMLElement {
    static get observedAttributes() {
      return [
        "server-url",
        "widget-script-url",
        "room-id",
        "client-app-id",
        "client-app-name",
        "external-user-id",
        "user-id",
        "auth-token",
        "title",
        "subtitle",
        "placeholder",
        "position",
        "mode",
        "auto-open",
        "support-inbox",
        "width",
        "height",
        "z-index",
        "user-name"
      ];
    }

    constructor() {
      super();
      this._mounted = false;
      this._mountId = `taiksu-chat-mount-${Math.random().toString(36).slice(2, 10)}`;
      this._reinitTimer = null;
    }

    connectedCallback() {
      this._mounted = true;
      if (!this.querySelector(`#${this._mountId}`)) {
        const holder = document.createElement("div");
        holder.id = this._mountId;
        holder.style.width = "100%";
        holder.style.minHeight = "1px";
        this.appendChild(holder);
      }
      this._init().catch((error) => {
        console.error("[TaiksuWidgetComponent]", error.message);
      });
    }

    disconnectedCallback() {
      this._mounted = false;
      if (this._reinitTimer) {
        clearTimeout(this._reinitTimer);
        this._reinitTimer = null;
      }
      this._destroy();
    }

    attributeChangedCallback() {
      if (!this._mounted) return;
      if (this._reinitTimer) clearTimeout(this._reinitTimer);
      this._reinitTimer = setTimeout(() => {
        this._init().catch((error) => {
          console.error("[TaiksuWidgetComponent]", error.message);
        });
      }, 80);
    }

    _buildConfig() {
      const serverUrl = String(this.getAttribute("server-url") || "").trim().replace(/\/+$/, "");
      const mode = String(this.getAttribute("mode") || "inline").trim() || "inline";
      return {
        serverUrl,
        roomId: String(this.getAttribute("room-id") || "").trim(),
        clientAppId: String(this.getAttribute("client-app-id") || "").trim(),
        clientAppName: String(this.getAttribute("client-app-name") || "").trim(),
        externalUserId: String(this.getAttribute("external-user-id") || "").trim(),
        userId: String(this.getAttribute("user-id") || "").trim(),
        authToken: String(this.getAttribute("auth-token") || "").trim(),
        userName: String(this.getAttribute("user-name") || "").trim(),
        title: String(this.getAttribute("title") || "Chat de Atendimento").trim(),
        subtitle: String(this.getAttribute("subtitle") || "").trim(),
        placeholder: String(this.getAttribute("placeholder") || "sua mensagem...").trim(),
        position: String(this.getAttribute("position") || "bottom-right").trim(),
        mode,
        mountSelector: mode === "inline" ? `#${this._mountId}` : "",
        autoOpen: toBool(this.getAttribute("auto-open"), false),
        supportInbox: toBool(this.getAttribute("support-inbox"), false),
        width: toNumber(this.getAttribute("width"), 380),
        height: toNumber(this.getAttribute("height"), 620),
        zIndex: toNumber(this.getAttribute("z-index"), 2147483000)
      };
    }

    _getWidgetScriptUrl(serverUrl) {
      const override = String(this.getAttribute("widget-script-url") || "").trim();
      if (override) return override;
      const base = serverUrl || window.location.origin;
      return `${base.replace(/\/+$/, "")}/js/taiksu-widget.js`;
    }

    _destroy() {
      if (window.TaiksuChat && typeof window.TaiksuChat.destroy === "function") {
        try {
          window.TaiksuChat.destroy();
        } catch (_err) {
          // noop
        }
      }
    }

    async _init() {
      const config = this._buildConfig();
      if (!config.serverUrl) {
        throw new Error("Atributo 'server-url' e obrigatorio.");
      }
      if (!config.roomId && !config.clientAppId) {
        throw new Error("Informe 'room-id' ou 'client-app-id'.");
      }

      const scriptUrl = this._getWidgetScriptUrl(config.serverUrl);
      await loadScript(scriptUrl);
      if (!window.TaiksuChat || typeof window.TaiksuChat.init !== "function") {
        throw new Error("TaiksuChat nao esta disponivel apos carregar script.");
      }

      this._destroy();
      window.TaiksuChat.init(config);
    }
  }

  customElements.define("taiksu-chat-widget", TaiksuChatWidgetElement);
})();
