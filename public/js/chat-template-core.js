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
    const timeStr = String(opts.timeStr || "");
    const bubbleHtml = String(opts.bubbleHtml || "");
    const checkHtml = String(opts.checkHtml || "");
    const messageId = escapeAttr(String(opts.messageId || ""));
    const senderId = escapeAttr(String(opts.senderId || ""));
    const rowClass = `tw-message ${own ? "sent" : "received"} ${grouped ? "grouped" : ""}`;

    return `
      <div class="${rowClass}" data-sender-id="${senderId}" ${messageId ? `data-message-id="${messageId}"` : ""}>
        ${(!grouped && !own) ? `<div class="tw-sender-name">${escapeHtml(senderName)}</div>` : ""}
        <div class="tw-bubble">${bubbleHtml}</div>
        <div class="tw-meta">
          <span class="tw-time">${timeStr}</span>
          ${own ? `<span class="tw-read" data-read-for="${messageId}">${checkHtml}</span>` : ""}
        </div>
      </div>
    `;
  }

  const api = {
    escapeHtml,
    escapeAttr,
    formatTimePtBr,
    insertTextAtCursor,
    EMOJI_LIST,
    loadRecentEmojis,
    saveRecentEmojis,
    rememberRecentEmoji,
    renderRoomMessageRow,
    renderWidgetMessageRow
  };

  if (typeof window !== "undefined") {
    window.ChatTemplateCore = api;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(this);
