const ChatRoom = require('../models/ChatRoom');
const settingsService = require('./settingsService');

class AlertService {
  constructor() {
    this.recentEvents = [];
    this.maxRecentEvents = 120;
    this.roomAlertState = new Map();
    this.monitorTimer = null;
  }

  getWebhookUrl() {
    return String(process.env.ALERT_WEBHOOK_URL || '').trim();
  }

  getWebhookToken() {
    return String(process.env.ALERT_WEBHOOK_TOKEN || '').trim();
  }

  getEmailApiUrl() {
    const settings = settingsService.load();
    const fromSettings = String(settings.alertEmailApiUrl || '').trim();
    if (fromSettings) return fromSettings;
    return String(process.env.ALERT_EMAIL_API_URL || 'https://email.taiksu.com.br/api/email/send').trim();
  }

  getEmailToken(runtimeToken = '') {
    const runtime = String(runtimeToken || '').trim();
    if (runtime) return runtime;
    const settings = settingsService.load();
    const fromSettings = String(settings.alertEmailToken || '').trim();
    if (fromSettings) return fromSettings;
    return String(process.env.ALERT_EMAIL_TOKEN || process.env.EMAIL_API_TOKEN || '').trim();
  }

  getEmailRecipients() {
    const settings = settingsService.load();
    const fromSettings = String(settings.alertEmailTo || '').trim();
    const source = fromSettings || String(process.env.ALERT_EMAIL_TO || '');
    return source
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  getEmailServiceId() {
    const settings = settingsService.load();
    const value = Number(settings.alertEmailServiceId || process.env.ALERT_EMAIL_SERVICE_ID || 1);
    return Number.isFinite(value) && value > 0 ? value : 1;
  }

  getEscalationMinutes() {
    const value = Number(process.env.ALERT_ESCALATION_MINUTES || 5);
    return Number.isFinite(value) && value > 0 ? value : 5;
  }

  getMonitorIntervalMs() {
    const value = Number(process.env.ALERT_MONITOR_INTERVAL_MS || 60000);
    return Number.isFinite(value) && value >= 10000 ? value : 60000;
  }

  normalizeState(value) {
    const state = String(value || '').trim().toUpperCase();
    return state || 'UNKNOWN';
  }

  shouldDeduplicate({ roomId, state, level }) {
    if (!roomId) return false;
    const key = String(roomId);
    const previous = this.roomAlertState.get(key);
    if (!previous) {
      this.roomAlertState.set(key, { state, level, at: Date.now() });
      return false;
    }
    if (previous.state === state && previous.level === level) return true;
    this.roomAlertState.set(key, { state, level, at: Date.now() });
    return false;
  }

  pushRecent(event) {
    this.recentEvents.push(event);
    if (this.recentEvents.length > this.maxRecentEvents) {
      this.recentEvents = this.recentEvents.slice(-this.maxRecentEvents);
    }
  }

  async postWebhook(event) {
    const url = this.getWebhookUrl();
    if (!url) return { sent: false, reason: 'missing_webhook_url' };

    const headers = { 'Content-Type': 'application/json' };
    const token = this.getWebhookToken();
    if (token) headers['x-alert-token'] = token;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(event)
      });
      if (!response.ok) {
        return { sent: false, reason: `http_${response.status}` };
      }
      return { sent: true };
    } catch (error) {
      return { sent: false, reason: error.message };
    }
  }

  shouldSendEmail(level) {
    const settings = settingsService.load();
    if (!settings.alertEmailEnabled) return false;
    return ['warning', 'critical'].includes(String(level || '').toLowerCase());
  }

  buildEmailSubject(event) {
    const level = String(event?.level || 'info').toUpperCase();
    const roomId = String(event?.roomId || 'n/a');
    return `[Chat Taiksu][${level}] Alerta de atendimento - sala ${roomId}`;
  }

  buildEmailBody(event) {
    return [
      `Tipo: ${event.type}`,
      `Nivel: ${event.level}`,
      `Sala: ${event.roomId || 'n/a'}`,
      `Chamado: ${event.chamadoId || 'n/a'}`,
      `Estado: ${event.chatState || 'n/a'}`,
      `Tempo de espera: ${event.waitMinutes || 0} min`,
      `Mensagem: ${event.message || '-'}`,
      `Usuario: ${event.actorName || '-'} (${event.actorId || '-'})`,
      `Timestamp: ${event.ts}`
    ].join('\n');
  }

  async sendEmail(event, runtimeToken = '') {
    if (!this.shouldSendEmail(event?.level)) return { sent: false, reason: 'level_not_enabled' };
    const recipients = this.getEmailRecipients();
    if (!recipients.length) return { sent: false, reason: 'missing_recipients' };
    const token = this.getEmailToken(runtimeToken);
    if (!token) return { sent: false, reason: 'missing_email_token' };

    const url = this.getEmailApiUrl();
    const payloadBase = {
      subject: this.buildEmailSubject(event),
      body: this.buildEmailBody(event),
      emailServiceId: this.getEmailServiceId(),
      attachments: []
    };

    try {
      const results = [];
      for (const to of recipients) {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ ...payloadBase, to })
        });
        results.push({ to, ok: response.ok, status: response.status });
      }
      const failed = results.filter((item) => !item.ok);
      if (failed.length) {
        return { sent: false, reason: 'partial_failure', results };
      }
      return { sent: true, results };
    } catch (error) {
      return { sent: false, reason: error.message };
    }
  }

  async emit(params = {}) {
    const event = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ts: new Date().toISOString(),
      type: String(params.type || 'generic_alert'),
      level: String(params.level || 'info'),
      roomId: String(params.roomId || ''),
      chamadoId: params.chamadoId ? String(params.chamadoId) : '',
      chatState: this.normalizeState(params.chatState),
      waitMinutes: Number(params.waitMinutes || 0),
      message: String(params.message || ''),
      actorId: params.actorId ? String(params.actorId) : '',
      actorName: params.actorName ? String(params.actorName) : ''
    };

    if (event.roomId && this.shouldDeduplicate({ roomId: event.roomId, state: event.chatState, level: event.level })) {
      return { emitted: false, deduplicated: true };
    }

    this.pushRecent(event);
    const webhookResult = await this.postWebhook(event);
    const emailResult = await this.sendEmail(event, params.authToken || '');
    return { emitted: true, webhook: webhookResult, email: emailResult, event };
  }

  getRecentSince(sinceMs = 0, limit = 40) {
    const threshold = Number(sinceMs || 0);
    const rows = this.recentEvents.filter((item) => new Date(item.ts).getTime() > threshold);
    return rows.slice(-Math.max(1, Math.min(Number(limit || 40), 200)));
  }

  async getPendingHumanSummary(limit = 20) {
    const rooms = await ChatRoom.findPendingHumanRooms(limit);
    const now = Date.now();
    const items = (rooms || []).map((room) => {
      const updatedAt = new Date(room.updated_at || room.created_at || now).getTime();
      const waitMinutes = Math.max(0, Math.floor((now - updatedAt) / 60000));
      return {
        roomId: String(room.id),
        name: room.name || 'Sala sem nome',
        chamadoId: room.chamado_id ? String(room.chamado_id) : null,
        chatState: this.normalizeState(room.chat_state),
        updatedAt: room.updated_at || room.created_at || null,
        waitMinutes
      };
    });
    return {
      count: items.length,
      items
    };
  }

  async runEscalationCheck() {
    const threshold = this.getEscalationMinutes();
    const summary = await this.getPendingHumanSummary(100);
    const pending = summary.items || [];
    for (const item of pending) {
      if (item.waitMinutes < threshold) continue;
      await this.emit({
        type: 'human_wait_escalation',
        level: 'critical',
        roomId: item.roomId,
        chamadoId: item.chamadoId || '',
        chatState: item.chatState,
        waitMinutes: item.waitMinutes,
        message: `Sala aguardando humano ha ${item.waitMinutes} minutos`
      });
    }
  }

  startMonitor() {
    if (this.monitorTimer) return;
    const interval = this.getMonitorIntervalMs();
    this.monitorTimer = setInterval(() => {
      this.runEscalationCheck().catch((error) => {
        console.error('[ALERT] Falha no monitor de escalonamento:', error.message);
      });
    }, interval);
  }
}

module.exports = new AlertService();
