class EventBrokerService {
  constructor() {
    this.recentKeys = new Map();
  }

  isEnabled() {
    return String(process.env.EVENTS_ENABLED || 'true').trim().toLowerCase() !== 'false';
  }

  getBaseUrl() {
    return String(process.env.EVENTS_BASE_URL || 'https://events.taiksu.com.br').trim().replace(/\/+$/, '');
  }

  getPublishUrl() {
    return `${this.getBaseUrl()}/api/event`;
  }

  getServiceToken() {
    return String(process.env.EVENTS_SERVICE_TOKEN || '').trim();
  }

  getEventIdByAlias(alias) {
    const key = String(alias || '').trim().toUpperCase();
    const map = {
      ROOM_OPENED_BY_USER: Number(process.env.EVENT_ID_ROOM_OPENED_BY_USER || 65),
      CHAMADO_CHAT_OPENED: Number(process.env.EVENT_ID_CHAMADO_CHAT_OPENED || 66),
      CHAT_CLOSED_MANUAL: Number(process.env.EVENT_ID_CHAT_CLOSED_MANUAL || 67),
      CHAT_CLOSED_INACTIVITY: Number(process.env.EVENT_ID_CHAT_CLOSED_INACTIVITY || 68),
      HUMAN_REQUESTED: Number(process.env.EVENT_ID_HUMAN_REQUESTED || 69),
      IA_REPLIED_SUCCESS: Number(process.env.EVENT_ID_IA_REPLIED_SUCCESS || 70),
      AI_MODEL_FAILURE: Number(process.env.EVENT_ID_AI_MODEL_FAILURE || 71),
      AI_FEEDBACK_UP: Number(process.env.EVENT_ID_AI_FEEDBACK_UP || 72),
      AI_FEEDBACK_DOWN: Number(process.env.EVENT_ID_AI_FEEDBACK_DOWN || 73),
      HUMAN_QUEUE_JOINED: Number(process.env.EVENT_ID_HUMAN_QUEUE_JOINED || 74),
      HUMAN_ASSIGNED: Number(process.env.EVENT_ID_HUMAN_ASSIGNED || 75),
      HUMAN_FINISHED: Number(process.env.EVENT_ID_HUMAN_FINISHED || 76),
      IA_FIRST_REPLY: Number(process.env.EVENT_ID_IA_FIRST_REPLY || 77),
      CHAT_MESSAGE_BLOCKED_CLOSED: Number(process.env.EVENT_ID_CHAT_MESSAGE_BLOCKED_CLOSED || 78),
      AI_TOOL_EXECUTED: Number(process.env.EVENT_ID_AI_TOOL_EXECUTED || 79)
    };
    const value = map[key];
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  normalizeUserId(userId) {
    const raw = String(userId || '').trim();
    if (!raw) return '0';
    const n = Number(raw);
    if (!Number.isFinite(n)) return '0';
    return String(Math.max(0, Math.trunc(n)));
  }

  dedupeWindowMs() {
    const n = Number(process.env.EVENTS_DEDUPE_MS || 60000);
    return Number.isFinite(n) && n >= 0 ? n : 60000;
  }

  makeDedupeKey(eventId, payload = {}) {
    return [
      String(eventId || ''),
      String(payload.roomId || ''),
      String(payload.chamadoId || ''),
      String(payload.messageId || payload.firstMessageId || ''),
      String(payload.chatState || ''),
      String(payload.status || ''),
      String(payload.reason || '')
    ].join(':');
  }

  shouldSkipByDedupe(eventId, payload = {}) {
    const ttl = this.dedupeWindowMs();
    if (!ttl) return false;
    const now = Date.now();
    const key = this.makeDedupeKey(eventId, payload);
    const prev = Number(this.recentKeys.get(key) || 0);
    if (prev && (now - prev) < ttl) return true;
    this.recentKeys.set(key, now);
    if (this.recentKeys.size > 3000) {
      const threshold = now - ttl * 2;
      for (const [k, ts] of this.recentKeys.entries()) {
        if (ts < threshold) this.recentKeys.delete(k);
      }
    }
    return false;
  }

  normalizePayload(payload = {}, context = {}) {
    const base = payload && typeof payload === 'object' ? { ...payload } : {};
    const source = String(base.source || context.source || 'chat-taiksu').trim() || 'chat-taiksu';
    const eventAlias = String(context.eventAlias || '').trim();
    const actorId = this.normalizeUserId(context.userId);
    const now = new Date().toISOString();
    return {
      ...base,
      source,
      roomId: base.roomId != null ? String(base.roomId) : '',
      chamadoId: base.chamadoId != null ? String(base.chamadoId) : '',
      messageId: base.messageId != null ? String(base.messageId) : '',
      firstMessageId: base.firstMessageId != null ? String(base.firstMessageId) : '',
      metadata: {
        eventId: Number(context.eventId || 0),
        eventAlias,
        emittedAt: now,
        payloadVersion: 2,
        service: 'chat-taiksu',
        environment: String(process.env.NODE_ENV || 'development'),
        actorId
      }
    };
  }

  async publish(eventId, {
    userId,
    priority = 'high',
    payload = {},
    eventAlias = ''
  } = {}) {
    if (!this.isEnabled()) return { ok: false, reason: 'disabled' };

    const token = this.getServiceToken();
    if (!token) return { ok: false, reason: 'missing_service_token' };

    const safeEventId = Number(eventId);
    if (!Number.isFinite(safeEventId) || safeEventId <= 0) {
      return { ok: false, reason: 'invalid_event_id' };
    }

    const normalizedPayload = this.normalizePayload(payload, {
      userId,
      eventId: safeEventId,
      eventAlias
    });

    if (this.shouldSkipByDedupe(safeEventId, normalizedPayload)) {
      return { ok: true, deduped: true };
    }

    const safePriority = String(priority || 'high').trim().toLowerCase();
    const headers = {
      'Content-Type': 'application/json',
      'service-token': token,
      user: this.normalizeUserId(userId),
      event: String(Math.trunc(safeEventId)),
      priority: ['low', 'normal', 'high'].includes(safePriority) ? safePriority : 'high'
    };

    try {
      const response = await fetch(this.getPublishUrl(), {
        method: 'POST',
        headers,
        body: JSON.stringify(normalizedPayload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        return { ok: false, status: response.status, data };
      }
      return { ok: true, status: response.status, data };
    } catch (error) {
      return { ok: false, reason: error.message };
    }
  }

  async publishAlias(alias, context = {}) {
    const eventId = this.getEventIdByAlias(alias);
    if (!eventId) return { ok: false, reason: 'missing_event_id_alias' };
    return this.publish(eventId, {
      ...context,
      eventAlias: String(alias || '').trim().toUpperCase()
    });
  }
}

module.exports = new EventBrokerService();
