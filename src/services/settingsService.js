const fs = require('fs');
const path = require('path');

class SettingsService {
  constructor() {
    const baseDataDir = String(process.env.DATA_DIR || 'src/data').trim();
    this.dataDir = path.resolve(process.cwd(), baseDataDir);
    this.filePath = path.join(this.dataDir, 'app-settings.json');
    this.cache = null;
    this.lastMtimeMs = 0;
  }

  defaults() {
    return {
      aiAttendantEnabled: String(process.env.AI_ATTENDANT_ENABLED || 'false').toLowerCase() === 'true',
      aiBetaModeEnabled: String(process.env.AI_BETA_MODE_ENABLED || 'false').toLowerCase() === 'true',
      aiBetaAllowlist: this.parseAllowlist(process.env.AI_BETA_ALLOWLIST || ''),
      aiAgentName: String(process.env.AI_USER_NAME || 'Marina').trim() || 'Marina',
      aiAgentAvatar: String(process.env.AI_USER_AVATAR || '/images/seta.png').trim() || '/images/seta.png',
      aiPersonalityPrompt: String(
        process.env.AI_PERSONALITY_PROMPT
        || 'Seja profissional, objetiva e acolhedora. Foque em resolver no chat e escalar para humano quando necessario.'
      ).trim(),
      aiTemperature: this.clampNumber(process.env.AI_TEMPERATURE, 0, 2, 0.25),
      aiMaxOutputTokens: this.clampInt(process.env.AI_MAX_OUTPUT_TOKENS, 64, 2048, 280),
      aiMaxReplyChars: this.clampInt(process.env.AI_MAX_REPLY_CHARS, 120, 4000, 420),
      kbAutoPublishEnabled: String(process.env.KB_AUTO_PUBLISH_ENABLED || 'false').toLowerCase() === 'true',
      alertEmailEnabled: String(process.env.ALERT_EMAIL_ENABLED || 'false').toLowerCase() === 'true',
      alertEmailApiUrl: String(process.env.ALERT_EMAIL_API_URL || 'https://email.taiksu.com.br/api/email/send').trim(),
      alertEmailToken: String(process.env.ALERT_EMAIL_TOKEN || process.env.EMAIL_API_TOKEN || '').trim(),
      alertEmailTo: String(process.env.ALERT_EMAIL_TO || '').trim(),
      alertEmailServiceId: Number(process.env.ALERT_EMAIL_SERVICE_ID || 1) || 1
    };
  }

  parseAllowlist(raw) {
    if (Array.isArray(raw)) {
      return raw
        .map((entry) => String(entry || '').trim().toLowerCase())
        .filter(Boolean);
    }
    return String(raw || '')
      .split(/[\n,;]+/g)
      .map((entry) => String(entry || '').trim().toLowerCase())
      .filter(Boolean);
  }

  clampNumber(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  clampInt(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(n)));
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
      aiBetaModeEnabled: input.aiBetaModeEnabled !== undefined ? Boolean(input.aiBetaModeEnabled) : current.aiBetaModeEnabled,
      aiBetaAllowlist: input.aiBetaAllowlist !== undefined
        ? this.parseAllowlist(input.aiBetaAllowlist)
        : this.parseAllowlist(current.aiBetaAllowlist || []),
      aiAgentName: input.aiAgentName !== undefined
        ? (String(input.aiAgentName || '').trim() || 'Marina')
        : String(current.aiAgentName || 'Marina'),
      aiAgentAvatar: input.aiAgentAvatar !== undefined
        ? (String(input.aiAgentAvatar || '').trim() || '/images/seta.png')
        : String(current.aiAgentAvatar || '/images/seta.png'),
      aiPersonalityPrompt: input.aiPersonalityPrompt !== undefined
        ? String(input.aiPersonalityPrompt || '').trim()
        : String(current.aiPersonalityPrompt || ''),
      aiTemperature: input.aiTemperature !== undefined
        ? this.clampNumber(input.aiTemperature, 0, 2, this.clampNumber(current.aiTemperature, 0, 2, 0.25))
        : this.clampNumber(current.aiTemperature, 0, 2, 0.25),
      aiMaxOutputTokens: input.aiMaxOutputTokens !== undefined
        ? this.clampInt(input.aiMaxOutputTokens, 64, 2048, this.clampInt(current.aiMaxOutputTokens, 64, 2048, 280))
        : this.clampInt(current.aiMaxOutputTokens, 64, 2048, 280),
      aiMaxReplyChars: input.aiMaxReplyChars !== undefined
        ? this.clampInt(input.aiMaxReplyChars, 120, 4000, this.clampInt(current.aiMaxReplyChars, 120, 4000, 420))
        : this.clampInt(current.aiMaxReplyChars, 120, 4000, 420),
      kbAutoPublishEnabled: input.kbAutoPublishEnabled !== undefined
        ? Boolean(input.kbAutoPublishEnabled)
        : current.kbAutoPublishEnabled,
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
      aiBetaModeEnabled: Boolean(current.aiBetaModeEnabled),
      aiBetaAllowlist: this.parseAllowlist(current.aiBetaAllowlist || []),
      aiAgentName: String(current.aiAgentName || 'Marina'),
      aiAgentAvatar: String(current.aiAgentAvatar || '/images/seta.png'),
      aiPersonalityPrompt: String(current.aiPersonalityPrompt || ''),
      aiTemperature: this.clampNumber(current.aiTemperature, 0, 2, 0.25),
      aiMaxOutputTokens: this.clampInt(current.aiMaxOutputTokens, 64, 2048, 280),
      aiMaxReplyChars: this.clampInt(current.aiMaxReplyChars, 120, 4000, 420),
      kbAutoPublishEnabled: Boolean(current.kbAutoPublishEnabled),
      alertEmailEnabled: Boolean(current.alertEmailEnabled),
      alertEmailApiUrl: String(current.alertEmailApiUrl || ''),
      alertEmailTo: String(current.alertEmailTo || ''),
      alertEmailServiceId: Number(current.alertEmailServiceId || 1),
      hasAlertEmailToken: Boolean(String(current.alertEmailToken || '').trim())
    };
  }
}

module.exports = new SettingsService();
