(function (globalScope) {
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

  function linkifyText(content) {
    const source = String(content || "");
    const escaped = escapeHtml(source);
    const formatted = escaped
      .replace(/(\*\*|__)([\s\S]*?)\1/g, "<strong>$2</strong>");
    const urlRegex = /(https?:\/\/[^\s<>"']+)/gi;
    const html = formatted.replace(urlRegex, (url) => {
      const safeUrl = String(url || "").trim();
      if (!/^https?:\/\//i.test(safeUrl)) return safeUrl;
      return `<a class="tw-link" href="${escapeAttr(safeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(safeUrl)}</a>`;
    });
    return html.replace(/\r?\n/g, "<br>");
  }

  function formatTimePtBr(dateValue) {
    return new Date(dateValue).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function insertTextAtCursor(input, text) {
    if (!input) return;
    const start = Number.isInteger(input.selectionStart) ? input.selectionStart : input.value.length;
    const end = Number.isInteger(input.selectionEnd) ? input.selectionEnd : input.value.length;
    input.value = `${input.value.slice(0, start)}${text}${input.value.slice(end)}`;
    const nextPos = start + String(text).length;
    input.selectionStart = nextPos;
    input.selectionEnd = nextPos;
    input.focus();
  }

  const EMOJI_LIST = ["\u{1f44b}","\u{1f4ac}","\u{1f4e9}","\u{1f4e8}","\u{1f4de}","\u{1f4f1}","\u{1f4cc}","\u{1f4ce}","\u{1f5c2}\u{fe0f}","\u{1f4c1}","\u{1f4dd}","\u{1f9fe}","\u{1f4ca}","\u{1f4c8}","\u{1f4c9}","\u{1f4b0}","\u{1f4b3}","\u{1f3e6}","\u{1f9ee}","\u{1f4c5}","\u{1f5d3}\u{fe0f}","\u{23f0}","\u{1f50d}","\u{1f50e}","\u{2699}\u{fe0f}","\u{1f6e0}\u{fe0f}","\u{1f5a5}\u{fe0f}","\u{2328}\u{fe0f}","\u{1f5a8}\u{fe0f}","\u{1f310}","\u{1f517}","\u{1f512}","\u{1f510}","\u{1f6e1}\u{fe0f}","\u{1f511}","\u{26a0}\u{fe0f}","\u{1f6a8}","\u{2757}","\u{2753}","\u{2139}\u{fe0f}","\u{23f3}","\u{1f552}","\u{1f680}","\u{1f504}","\u{267b}\u{fe0f}","\u{1f4e4}","\u{1f4e5}","\u{1f4e6}","\u{1f3f7}\u{fe0f}","\u{1f4cb}","\u{1f4c4}","\u{1f4d1}","\u{1f91d}","\u{1f465}","\u{1f3e2}","\u{1f1e7}\u{1f1f7}","\u{1f64f}","\u{2705}","\u{2714}\u{fe0f}","\u{2611}\u{fe0f}","\u{274c}","\u{1f363}","\u{1f371}","\u{1f962}","\u{1f359}","\u{1f364}","\u{1f35c}","\u{1f35b}","\u{1f35a}","\u{1f358}","\u{1f365}","\u{1f991}","\u{1f41f}","\u{1f420}","\u{1f990}","\u{1f95f}","\u{1f362}","\u{1f361}","\u{1f375}","\u{1fad6}","\u{1f961}","\u{1f960}","\u{1f376}","\u{1f957}","\u{1f34b}","\u{1f336}\u{fe0f}","\u{1f9c2}","\u{1f525}","\u{1f468}\u{200d}\u{1f373}","\u{1f3ee}","\u{1f1ef}\u{1f1f5}"];

  function loadRecentEmojis(storageKey, allowedList = EMOJI_LIST, max = 24) {
    try {
      const raw = localStorage.getItem(String(storageKey || ""));
      const parsed = JSON.parse(raw || "[]");
      if (!Array.isArray(parsed)) return [];
      const safeAllowed = Array.isArray(allowedList) && allowedList.length ? allowedList : EMOJI_LIST;
      return parsed.filter((item) => safeAllowed.includes(item)).slice(0, max);
    } catch (_err) {
      return [];
    }
  }

  function saveRecentEmojis(storageKey, list, max = 24) {
    try {
      const safe = Array.isArray(list) ? list.slice(0, max) : [];
      localStorage.setItem(String(storageKey || ""), JSON.stringify(safe));
    } catch (_err) {
      // noop
    }
  }

  function rememberRecentEmoji(storageKey, emoji, allowedList = EMOJI_LIST, max = 24) {
    const safeAllowed = Array.isArray(allowedList) && allowedList.length ? allowedList : EMOJI_LIST;
    if (!safeAllowed.includes(emoji)) return [];
    const next = loadRecentEmojis(storageKey, safeAllowed, max).filter((item) => item !== emoji);
    next.unshift(emoji);
    saveRecentEmojis(storageKey, next, max);
    return next.slice(0, max);
  }

  function renderRoomMessageRow(opts) {
    const own = Boolean(opts.own);
    const grouped = Boolean(opts.grouped);
    const senderName = String(opts.senderName || "");
    const timeStr = String(opts.timeStr || "");
    const readClass = String(opts.readClass || "text-gray-400");
    const bubbleHtml = String(opts.bubbleHtml || "");
    const avatarHtml = String(opts.avatarHtml || "");
    const messageId = escapeAttr(String(opts.messageId || ""));
    const userId = escapeAttr(String(opts.userId || ""));
    const readVisibleClass = opts.isRead ? "" : "hidden";

    return `
      <div class="message message-enter ${own ? "own justify-end" : ""} ${grouped ? "grouped" : "mt-4"} flex items-end gap-2" data-id="${messageId}" data-user-id="${userId}">
        ${avatarHtml}
        <div class="message-content flex min-w-0 max-w-[85%] flex-col sm:max-w-[72%] ${own ? "items-end" : "items-start"}">
          ${grouped ? "" : `<div class="message-sender mb-0.5 px-1 text-[11px] font-bold text-emerald-800 uppercase tracking-tight">${escapeHtml(senderName)}</div>`}
          <div class="message-bubble relative rounded-2xl px-3 py-2 text-[15px] leading-relaxed break-words">${bubbleHtml}</div>
          <div class="mt-1 flex items-center gap-1.5 px-1">
            <span class="text-[10px] font-medium text-gray-500">${timeStr}</span>
            ${own ? `<div class="message-read flex items-center ${readClass}" data-read-for="${messageId}"><svg width="15" height="14" viewBox="0 0 16 15" fill="none" class="check-sent"><path d="M1.5 8.5L4.5 11.5L14.5 1.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><svg width="18" height="14" viewBox="0 0 19 15" fill="none" class="check-read ${readVisibleClass}"><path d="M1.5 8.5L4.5 11.5L9.5 6.5M7.5 8.5L10.5 11.5L17.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>` : ""}
          </div>
        </div>
      </div>
    `;
  }

  function renderWidgetMessageRow(opts) {
    const own = Boolean(opts.own);
    const grouped = Boolean(opts.grouped);
    const senderName = String(opts.senderName || "");
    const ownLabel = String(opts.ownLabel || "VOCE");
    const showOwnName = Boolean(opts.showOwnName);
    const timeStr = String(opts.timeStr || "");
    const bubbleHtml = String(opts.bubbleHtml || "");
    const checkHtml = String(opts.checkHtml || "");
    const avatarHtml = String(opts.avatarHtml || "");
    const messageId = escapeAttr(String(opts.messageId || ""));
    const senderId = escapeAttr(String(opts.senderId || ""));
    const rowClass = `tw-message ${own ? "sent" : "received"} ${grouped ? "grouped" : ""}`;

    return `
      <div class="${rowClass}" data-sender-id="${senderId}" ${messageId ? `data-message-id="${messageId}"` : ""}>
        ${avatarHtml}
        <div class="tw-message-content">
          ${(!grouped && (!own || showOwnName)) ? `<div class="tw-sender-name">${escapeHtml(own ? ownLabel : senderName)}</div>` : ""}
          <div class="tw-bubble">${bubbleHtml}</div>
          <div class="tw-meta">
            <span class="tw-time">${timeStr}</span>
            ${own ? `<span class="tw-read" data-read-for="${messageId}">${checkHtml}</span>` : ""}
          </div>
        </div>
      </div>
    `;
  }

  function renderAvatarStack(participants = [], limit = 4) {
    const safe = Array.isArray(participants) ? participants : [];
    const visible = safe.slice(0, Math.max(1, limit));
    const hiddenCount = Math.max(0, safe.length - visible.length);

    const items = visible.map((participant, idx) => {
      const name = String(participant && participant.name ? participant.name : "Usuario");
      const avatar = String(participant && participant.avatar ? participant.avatar : "");
      const status = String(participant && participant.status ? participant.status : "");
      const initial = escapeHtml(name.trim().charAt(0).toUpperCase() || "U");
      const dotColor = status === "online" ? "#4ade80" : "#9ca3af";
      return `
        <div class="tw-avatar-item" style="z-index:${5 - idx}" title="${escapeAttr(name)}${status ? ` (${escapeAttr(status)})` : ""}">
          ${avatar ? `<img src="${escapeAttr(avatar)}" alt="${escapeAttr(name)}">` : `<div style="display:flex;height:100%;width:100%;align-items:center;justify-content:center;background:#059669;color:#fff;font-size:10px;font-weight:700">${initial}</div>`}
          <span style="position:absolute;bottom:0;right:0;height:8px;width:8px;border-radius:9999px;border:1px solid #047857;background:${dotColor}"></span>
        </div>
      `;
    }).join("");

    return `
      <div class="tw-avatar-stack">
        ${items}
        ${hiddenCount ? `<div class="tw-avatar-more">+${hiddenCount}</div>` : ""}
      </div>
    `;
  }

  function renderConversationHeader(opts = {}) {
    const title = escapeHtml(String(opts.title || ""));
    const subtitle = escapeHtml(String(opts.subtitle || ""));
    const backButtonHtml = String(opts.backButtonHtml || "");
    const badgesHtml = String(opts.badgesHtml || "");
    const participants = Array.isArray(opts.participants) ? opts.participants : [];
    const actionsHtml = String(opts.actionsHtml || "");
    const participantsHtml = renderAvatarStack(participants, Number(opts.avatarLimit || 4));
    const titleSize = Number(opts.titleSize || 30);
    const subtitleColor = String(opts.subtitleColor || "rgba(236,253,245,.92)");

    return `
      <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px;background:linear-gradient(to right,#065f46,#047857);padding:16px 20px;color:#fff">
        <div style="display:flex;min-width:0;flex:1;align-items:center;gap:16px">
          ${backButtonHtml}
          <div style="min-width:0;flex:1">
            <h2 style="margin:0;font-size:${titleSize}px;line-height:1.1;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${title}</h2>
            <p style="margin:4px 0 0 0;font-size:12px;color:${subtitleColor};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${subtitle}</p>
            ${badgesHtml ? `<div style="margin-top:8px;display:flex;align-items:center;gap:8px">${badgesHtml}</div>` : ""}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <div style="margin-right:8px">${participantsHtml}</div>
          ${actionsHtml}
        </div>
      </div>
    `;
  }

  function renderPillsBar(opts = {}) {
    const rootClass = String(opts.rootClass || "");
    const pillClass = String(opts.pillClass || "");
    const rightClass = String(opts.rightClass || "");
    const readId = escapeAttr(String(opts.readId || "pillMarkRead"));
    const endId = escapeAttr(String(opts.endId || "pillScrollEnd"));
    const mediaId = escapeAttr(String(opts.mediaId || "pillSendMedia"));

    return `
      <div class="${rootClass}">
        <span class="${pillClass}">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/></svg>
          Rolagem suave
        </span>
        <span class="${pillClass}">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v12H5.17L4 17.17z"/><path d="M8 9h8M8 13h5"/></svg>
          Widget-like
        </span>
        <div class="${rightClass}">
          <button type="button" id="${readId}" class="${pillClass}">Marcar tudo como lido</button>
          <button type="button" id="${endId}" class="${pillClass}">Ir para o fim</button>
          <button type="button" id="${mediaId}" class="${pillClass}">Enviar midia</button>
        </div>
      </div>
    `;
  }

  function fileNameFromUrl(fileUrl, fallback = "arquivo") {
    const safe = String(fileUrl || "").split("?")[0];
    const parts = safe.split("/");
    const last = parts[parts.length - 1] || "";
    return last || fallback;
  }

  function renderMessageContent(opts = {}) {
    const message = opts.message || {};
    const type = String(message.type || "text");
    const content = String(message.content || "");
    const rawUrl = message.file_url || message.fileUrl || "";
    const mediaUrl = opts.resolveMediaUrl ? opts.resolveMediaUrl(rawUrl) : rawUrl;

    if (type === "text") {
      return linkifyText(content);
    }

    if (!mediaUrl) {
      return "Arquivo sem URL";
    }

    if (type === "image") {
      const imageClass = String(opts.imageClass || "");
      const imageWrapperClass = String(opts.imageWrapperClass || "");
      const imageOnClick = String(opts.imageOnClick || "");
      if (imageWrapperClass) {
        return `<div class="${imageWrapperClass}" ${imageOnClick ? `onclick="${escapeAttr(imageOnClick)}"` : ""}><img src="${escapeAttr(mediaUrl)}" class="${imageClass}" alt="Imagem" loading="lazy"></div>`;
      }
      return `<img src="${escapeAttr(mediaUrl)}" class="${imageClass}" alt="Imagem" loading="lazy">`;
    }

    if (type === "audio") {
      if (typeof opts.audioRenderer === "function") {
        return opts.audioRenderer(mediaUrl, message);
      }
      return `<audio controls src="${escapeAttr(mediaUrl)}"></audio>`;
    }

    const fileName = escapeHtml(
      String(message.filename || opts.fileName || fileNameFromUrl(mediaUrl, "documento.pdf"))
    );
    const fileType = escapeHtml(String(message.file_type || message.fileType || opts.fileType || "DOC"));
    if (typeof opts.documentRenderer === "function") {
      return opts.documentRenderer(mediaUrl, fileName, fileType);
    }
    const docClass = String(opts.docClass || "");
    const docIconHtml = String(opts.docIconHtml || "");
    const docMetaClass = String(opts.docMetaClass || "");

    if (docClass) {
      return `<a class="${docClass}" href="${escapeAttr(mediaUrl)}" download>${docIconHtml}${docMetaClass ? `<span class="${docMetaClass}">${fileName}</span>` : fileName}${docMetaClass ? `<span class="${docMetaClass}">${fileType}</span>` : ""}</a>`;
    }
    return `<a href="${escapeAttr(mediaUrl)}" download>${fileName}</a>`;
  }

  function renderRoomComposer(opts = {}) {
    const closed = Boolean(opts.closed);
    const disabledAttr = closed ? "disabled" : "";
    const placeholder = escapeAttr(opts.placeholder || (closed ? "Este chat esta fechado" : "Digite uma mensagem..."));

    return `
      <div class="relative border-t border-gray-100 bg-white px-4 py-4 sm:px-6" style="padding-bottom: calc(1rem + env(safe-area-inset-bottom));">
        <div class="tw-attach-menu" id="twAttachMenu">
          <button class="tw-attach-item" onclick="setFileType('image'); document.getElementById('fileInput').click();">
            <div class="tw-attach-circle" style="background: #ec4899;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 20"/></svg>
            </div>
          </button>
          <button class="tw-attach-item" onclick="setFileType('video'); document.getElementById('fileInput').click();">
            <div class="tw-attach-circle" style="background: #f97316;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
            </div>
          </button>
          <button class="tw-attach-item" onclick="setFileType('document'); document.getElementById('fileInput').click();">
            <div class="tw-attach-circle" style="background: #6366f1;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M13 2v7h7"/></svg>
            </div>
          </button>
        </div>

        <input type="file" id="fileInput" class="hidden" onchange="sendFile(this)">
        <div id="emojiPicker" class="emoji-picker">
          <div class="border-b border-green-100 px-3 py-2">
            <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">Recentes</p>
            <div id="emojiRecent" class="emoji-grid max-h-[72px]"></div>
          </div>
          <div>
            <p class="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Todos</p>
            <div id="emojiAll" class="emoji-grid"></div>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <button class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 transition hover:bg-emerald-100 disabled:opacity-40" id="fileBtn" onclick="toggleAttachMenu()" title="Anexar" type="button" ${disabledAttr}>
            <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
          </button>
          <button class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 transition hover:bg-emerald-100 disabled:opacity-40" id="emojiBtn" onclick="toggleEmojiPicker()" title="Emoji" type="button" ${disabledAttr}>
            <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>
          </button>

          <div class="group relative flex min-w-0 flex-1 items-center rounded-2xl bg-gray-100 px-3 transition-all focus-within:bg-gray-200/50 focus-within:ring-2 focus-within:ring-emerald-200">
            <textarea class="min-h-[48px] max-h-32 w-full resize-none bg-transparent py-3 text-[15.5px] text-gray-800 outline-none placeholder:text-gray-500 disabled:cursor-not-allowed" id="messageInput" placeholder="${placeholder}" onkeypress="handleKeyPress(event)" onkeyup="updateActionButton()" onkeydown="setTypingStatus(true)" ${disabledAttr}></textarea>
          </div>

          <button class="hidden h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg transition hover:bg-emerald-700 disabled:opacity-40" id="sendBtn" onclick="sendMessage()" title="Enviar" type="button" ${disabledAttr}>
            <svg class="h-6 w-6 translate-x-[1px]" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>

          <button class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg transition hover:bg-emerald-700 disabled:opacity-40" id="micBtn" title="Gravar" type="button" ${disabledAttr}>
            <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
          </button>
        </div>
      </div>
    `;
  }

  function renderWidgetComposer(opts = {}) {
    const placeholder = escapeAttr(opts.placeholder || "sua mensagem...");
    return `
      <div class="tw-attach-menu" id="tw-attach-menu">
        <button class="tw-attach-item" data-type="document" title="Documento">
          <div class="tw-attach-circle" style="background: #6366f1;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg></div>
        </button>
        <button class="tw-attach-item" data-type="image" title="Midia">
          <div class="tw-attach-circle" style="background: #ec4899;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg></div>
        </button>
        <button class="tw-attach-item" data-type="audio" title="Audio">
          <div class="tw-attach-circle" style="background: #f97316;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v1a7 7 0 0 1-14 0v-1"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg></div>
        </button>
      </div>
      <div class="tw-emoji-picker" id="tw-emoji-picker">
         <div id="tw-emoji-recent"></div>
         <div class="tw-emoji-section-title">Todos Emojis</div>
         <div class="tw-emoji-grid" id="tw-emoji-all-grid"></div>
      </div>
      <div class="tw-typing" id="tw-typing">
        <span>Digitando</span>
        <div class="tw-dot"></div><div class="tw-dot"></div><div class="tw-dot"></div>
      </div>
      <div class="tw-system" id="tw-system-msg"></div>
      <div class="tw-input-area" id="tw-input-area">
        <div class="tw-input-row">
          <button class="tw-icon-btn" id="tw-attach-btn" title="Anexar"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg></button>
          <button class="tw-icon-btn" id="tw-emoji-btn" title="Emojis"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg></button>
          <textarea class="tw-input" id="tw-input" placeholder="${placeholder}" rows="1" autocomplete="off"></textarea>
          <button class="tw-action-btn pulse" id="tw-action-btn" title="Enviar">
            <span id="tw-action-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v1a7 7 0 0 1-14 0v-1"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg></span>
          </button>
        </div>
        <div class="tw-recording-chip" id="tw-recording-chip">
          <span class="tw-recording-dot"></span>
          <strong>Gravando audio...</strong>
        </div>
      </div>
      <div class="tw-closed-footer" id="tw-closed-footer" style="display:none;">
        <div class="tw-closed-inner">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 118 0v4"></path></svg>
          <div class="tw-closed-text">
            <strong>Chat encerrado</strong>
            <span id="tw-closed-reason">Apenas leitura do historico</span>
          </div>
        </div>
      </div>
      <input type="file" id="tw-file-input" style="display:none;" />
    `;
  }

  const api = {
    escapeHtml,
    escapeAttr,
    linkifyText,
    formatTimePtBr,
    insertTextAtCursor,
    EMOJI_LIST,
    loadRecentEmojis,
    saveRecentEmojis,
    rememberRecentEmoji,
    renderRoomComposer,
    renderWidgetComposer,
    renderAvatarStack,
    renderConversationHeader,
    renderPillsBar,
    renderMessageContent,
    renderRoomMessageRow,
    renderWidgetMessageRow,
    fileNameFromUrl
  };

  if (typeof window !== "undefined") {
    window.ChatTemplateCore = api;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(this);
