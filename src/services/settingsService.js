const fs = require('fs');
const path = require('path');

class SettingsService {
  constructor() {
    this.filePath = path.resolve(process.cwd(), 'src/data/app-settings.json');
    this.cache = null;
    this.lastMtimeMs = 0;
  }

  defaults() {
    return {
      aiAttendantEnabled: String(process.env.AI_ATTENDANT_ENABLED || 'false').toLowerCase() === 'true',
      alertEmailEnabled: String(process.env.ALERT_EMAIL_ENABLED || 'false').toLowerCase() === 'true',
      alertEmailApiUrl: String(process.env.ALERT_EMAIL_API_URL || 'https://email.taiksu.com.br/api/email/send').trim(),
      alertEmailToken: String(process.env.ALERT_EMAIL_TOKEN || process.env.EMAIL_API_TOKEN || '').trim(),
      alertEmailTo: String(process.env.ALERT_EMAIL_TO || '').trim(),
      alertEmailServiceId: Number(process.env.ALERT_EMAIL_SERVICE_ID || 1) || 1
    };
  }

  ensureDir() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  load() {
    this.ensureDir();
    const base = this.defaults();
    if (!fs.existsSync(this.filePath)) {
      this.cache = base;
      this.lastMtimeMs = 0;
      return { ...base };
    }

    const stat = fs.statSync(this.filePath);
    if (this.cache && stat.mtimeMs <= this.lastMtimeMs) {
      return { ...this.cache };
    }

    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw || '{}');
      const merged = { ...base, ...(parsed || {}) };
      this.cache = merged;
      this.lastMtimeMs = stat.mtimeMs;
      return { ...merged };
    } catch (_err) {
      this.cache = base;
      this.lastMtimeMs = stat.mtimeMs;
      return { ...base };
    }
  }

  save(input = {}) {
    const current = this.load();
    const next = {
      ...current,
      aiAttendantEnabled: input.aiAttendantEnabled !== undefined ? Boolean(input.aiAttendantEnabled) : current.aiAttendantEnabled,
      alertEmailEnabled: input.alertEmailEnabled !== undefined ? Boolean(input.alertEmailEnabled) : current.alertEmailEnabled,
      alertEmailApiUrl: input.alertEmailApiUrl !== undefined ? String(input.alertEmailApiUrl || '').trim() : current.alertEmailApiUrl,
      alertEmailToken: input.alertEmailToken !== undefined ? String(input.alertEmailToken || '').trim() : current.alertEmailToken,
      alertEmailTo: input.alertEmailTo !== undefined ? String(input.alertEmailTo || '').trim() : current.alertEmailTo,
      alertEmailServiceId: input.alertEmailServiceId !== undefined
        ? (Number(input.alertEmailServiceId) > 0 ? Number(input.alertEmailServiceId) : 1)
        : current.alertEmailServiceId
    };

    this.ensureDir();
    fs.writeFileSync(this.filePath, JSON.stringify(next, null, 2), 'utf-8');
    this.cache = next;
    try {
      this.lastMtimeMs = fs.statSync(this.filePath).mtimeMs;
    } catch (_err) {
      this.lastMtimeMs = Date.now();
    }
    return { ...next };
  }

  safeForClient() {
    const current = this.load();
    return {
      aiAttendantEnabled: Boolean(current.aiAttendantEnabled),
      alertEmailEnabled: Boolean(current.alertEmailEnabled),
      alertEmailApiUrl: String(current.alertEmailApiUrl || ''),
      alertEmailTo: String(current.alertEmailTo || ''),
      alertEmailServiceId: Number(current.alertEmailServiceId || 1),
      hasAlertEmailToken: Boolean(String(current.alertEmailToken || '').trim())
    };
  }
}

module.exports = new SettingsService();
