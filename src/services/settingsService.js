const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { AppSettingModel } = require('../models/sequelize-models');

const SETTINGS_DB_ID = 'global';

class SettingsService {
  constructor() {
    const baseDataDir = String(process.env.DATA_DIR || 'src/data').trim();
    this.dataDir = path.resolve(process.cwd(), baseDataDir);
    this.filePath = path.join(this.dataDir, 'app-settings.json');
    this.cache = null;
    this.lastMtimeMs = 0;
    this.dbHydrated = false;
    this.dbHydratePromise = null;
  }

  getAllowedProviders() {
    return ['ollama'];
  }

  normalizeProvider(value, fallback = 'ollama') {
    const provider = String(value || '').trim().toLowerCase();
    return this.getAllowedProviders().includes(provider) ? provider : fallback;
  }

  getDefaultProvider() {
    const ordered = String(process.env.AI_PROVIDER_ORDER || 'ollama')
      .split(',')
      .map((item) => this.normalizeProvider(item, ''))
      .filter(Boolean);
    return ordered[0] || 'ollama';
  }

  getDefaultModelByProvider(_provider) {
    return String(process.env.OLLAMA_MODEL || process.env.ollama_MODEL || 'gemma3:1b').trim();
  }

  defaults() {
    const preferredProvider = this.normalizeProvider(
      process.env.AI_DEFAULT_PROVIDER,
      this.getDefaultProvider()
    );
    return {
      aiAttendantEnabled: String(process.env.AI_ATTENDANT_ENABLED || 'false').toLowerCase() === 'true',
      aiAllowAdminChat: String(process.env.AI_ALLOW_ADMIN_CHAT || 'false').toLowerCase() === 'true',
      aiBetaModeEnabled: String(process.env.AI_BETA_MODE_ENABLED || 'false').toLowerCase() === 'true',
      aiBetaAllowlist: this.parseAllowlist(process.env.AI_BETA_ALLOWLIST || ''),
      aiAgentName: String(process.env.AI_USER_NAME || 'Marina').trim() || 'Marina',
      aiAgentAvatar: String(process.env.AI_USER_AVATAR || '/images/marina.png').trim() || '/images/marina.png',
      aiPersonalityPrompt: String(
        process.env.AI_PERSONALITY_PROMPT
        || 'Seja profissional, objetiva e acolhedora. Foque em resolver no chat e escalar para humano quando necessario.'
      ).trim(),
      aiTemperature: this.clampNumber(process.env.AI_TEMPERATURE, 0, 2, 0.25),
      aiMaxOutputTokens: this.clampInt(process.env.AI_MAX_OUTPUT_TOKENS, 64, 2048, 280),
      aiMaxReplyChars: this.clampInt(process.env.AI_MAX_REPLY_CHARS, 120, 4000, 420),
      aiPreferredProvider: preferredProvider,
      aiPreferredModel: String(
        process.env.AI_DEFAULT_MODEL
        || this.getDefaultModelByProvider(preferredProvider)
      ).trim(),
      aiTranscriptionProvider: this.normalizeProvider(
        process.env.AI_TRANSCRIPTION_PROVIDER,
        preferredProvider
      ),
      aiTranscriptionModel: String(
        process.env.AI_TRANSCRIPTION_MODEL
        || process.env.OLLAMA_STT_MODEL
        || ''
      ).trim(),
      aiAudioTranscriptionEnabled: String(process.env.AI_AUDIO_TRANSCRIPTION_ENABLED || 'false').toLowerCase() === 'true',
      aiTranscriptionApiUrl: String(
        process.env.AI_TRANSCRIPTION_API_URL
        || process.env.WHISPER_API_URL
        || 'https://whisper.taiksu.com.br/api/transcribe'
      ).trim(),
      aiTranscriptionApiToken: String(
        process.env.AI_TRANSCRIPTION_API_TOKEN
        || process.env.WHISPER_API_TOKEN
        || ''
      ).trim(),
      aiTranscriptionLanguage: String(process.env.AI_TRANSCRIPTION_LANGUAGE || 'pt').trim() || 'pt',
      aiTranscriptionResponseFormat: String(process.env.AI_TRANSCRIPTION_RESPONSE_FORMAT || 'json').trim() || 'json',
      aiCustomModels: this.parseCustomModels(process.env.AI_CUSTOM_MODELS || ''),
      ollamaApiToken: String(process.env.OLLAMA_API_TOKEN || '').trim(),
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

  parseCustomModels(raw) {
    if (Array.isArray(raw)) {
      return raw
        .map((entry) => this.normalizeCustomModelEntry(entry))
        .filter(Boolean);
    }

    return String(raw || '')
      .split(/\r?\n|[,;]+/g)
      .map((entry) => this.normalizeCustomModelEntry(entry))
      .filter(Boolean);
  }

  normalizeCustomModelEntry(rawEntry) {
    if (!rawEntry) return null;
    if (typeof rawEntry === 'object' && !Array.isArray(rawEntry)) {
      const provider = this.normalizeProvider(rawEntry.provider, '');
      const model = String(rawEntry.model || '').trim();
      if (!provider || !model) return null;
      return `${provider}:${model}`;
    }

    const value = String(rawEntry || '').trim();
    if (!value) return null;
    const separatorIdx = value.indexOf(':');
    if (separatorIdx <= 0) return null;
    const provider = this.normalizeProvider(value.slice(0, separatorIdx), '');
    const model = String(value.slice(separatorIdx + 1) || '').trim();
    if (!provider || !model) return null;
    return `${provider}:${model}`;
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

  getOllamaTokenAuditPath() {
    return path.join(this.dataDir, 'ollama-token-audit.json');
  }

  loadOllamaTokenAudit(limit = 20) {
    this.ensureDir();
    const filePath = this.getOllamaTokenAuditPath();
    if (!fs.existsSync(filePath)) return [];
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw || '[]');
      const items = Array.isArray(parsed) ? parsed : [];
      const normalized = items
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => ({
          id: String(entry.id || ''),
          timestamp: String(entry.timestamp || ''),
          action: String(entry.action || ''),
          actorId: String(entry.actorId || ''),
          actorName: String(entry.actorName || ''),
          source: String(entry.source || ''),
          ip: String(entry.ip || ''),
          userAgent: String(entry.userAgent || '')
        }))
        .filter((entry) => entry.timestamp);
      return normalized
        .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
        .slice(0, Math.max(1, Number(limit) || 20));
    } catch (_err) {
      return [];
    }
  }

  appendOllamaTokenAudit(entry) {
    this.ensureDir();
    const filePath = this.getOllamaTokenAuditPath();
    let current = [];
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw || '[]');
        current = Array.isArray(parsed) ? parsed : [];
      } catch (_err) {
        current = [];
      }
    }
    const next = [entry, ...current].slice(0, 200);
    fs.writeFileSync(filePath, JSON.stringify(next, null, 2), 'utf-8');
    return next;
  }

  async rotateOllamaToken(meta = {}) {
    const token = crypto.randomBytes(32).toString('hex');
    await this.save({ ollamaApiToken: token });
    const entry = {
      id: `tok_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      timestamp: new Date().toISOString(),
      action: 'rotate_ollama_api_token',
      actorId: String(meta.actorId || ''),
      actorName: String(meta.actorName || ''),
      source: String(meta.source || 'settings-panel'),
      ip: String(meta.ip || ''),
      userAgent: String(meta.userAgent || '')
    };
    this.appendOllamaTokenAudit(entry);
    return { token, audit: entry };
  }

  load() {
    this.kickOffDbHydration();
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

  kickOffDbHydration() {
    if (this.dbHydrated) return;
    if (this.dbHydratePromise) return;
    this.dbHydratePromise = this.hydrateFromDatabase()
      .catch(() => {})
      .finally(() => {
        this.dbHydrated = true;
        this.dbHydratePromise = null;
      });
  }

  async hydrateFromDatabase() {
    const row = await AppSettingModel.findByPk(SETTINGS_DB_ID);
    if (!row) return null;
    const payload = String(row.payload_json || '{}').trim() || '{}';
    let parsed = {};
    try {
      parsed = JSON.parse(payload);
    } catch (_err) {
      parsed = {};
    }
    const merged = { ...this.defaults(), ...(parsed || {}) };
    this.ensureDir();
    fs.writeFileSync(this.filePath, JSON.stringify(merged, null, 2), 'utf-8');
    this.cache = merged;
    try {
      this.lastMtimeMs = fs.statSync(this.filePath).mtimeMs;
    } catch (_err) {
      this.lastMtimeMs = Date.now();
    }
    return { ...merged };
  }

  async persistToDatabase(payload) {
    await AppSettingModel.upsert({
      id: SETTINGS_DB_ID,
      payload_json: JSON.stringify(payload || {})
    });
  }

  async save(input = {}) {
    const current = this.load();
    const providerFallback = this.normalizeProvider(current.aiPreferredProvider, this.getDefaultProvider());
    const preferredProvider = input.aiPreferredProvider !== undefined
      ? this.normalizeProvider(input.aiPreferredProvider, providerFallback)
      : providerFallback;
    const preferredModel = input.aiPreferredModel !== undefined
      ? String(input.aiPreferredModel || '').trim()
      : String(current.aiPreferredModel || '').trim();

    const next = {
      ...current,
      aiAttendantEnabled: input.aiAttendantEnabled !== undefined ? Boolean(input.aiAttendantEnabled) : current.aiAttendantEnabled,
      aiAllowAdminChat: input.aiAllowAdminChat !== undefined ? Boolean(input.aiAllowAdminChat) : Boolean(current.aiAllowAdminChat),
      aiBetaModeEnabled: input.aiBetaModeEnabled !== undefined ? Boolean(input.aiBetaModeEnabled) : current.aiBetaModeEnabled,
      aiBetaAllowlist: input.aiBetaAllowlist !== undefined
        ? this.parseAllowlist(input.aiBetaAllowlist)
        : this.parseAllowlist(current.aiBetaAllowlist || []),
      aiAgentName: input.aiAgentName !== undefined
        ? (String(input.aiAgentName || '').trim() || 'Marina')
        : String(current.aiAgentName || 'Marina'),
      aiAgentAvatar: input.aiAgentAvatar !== undefined
        ? (String(input.aiAgentAvatar || '').trim() || '/images/marina.png')
        : String(current.aiAgentAvatar || '/images/marina.png'),
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
      aiPreferredProvider: preferredProvider,
      aiPreferredModel: preferredModel || this.getDefaultModelByProvider(preferredProvider),
      aiTranscriptionProvider: input.aiTranscriptionProvider !== undefined
        ? this.normalizeProvider(input.aiTranscriptionProvider, preferredProvider)
        : this.normalizeProvider(current.aiTranscriptionProvider, preferredProvider),
      aiTranscriptionModel: input.aiTranscriptionModel !== undefined
        ? String(input.aiTranscriptionModel || '').trim()
        : String(current.aiTranscriptionModel || '').trim(),
      aiAudioTranscriptionEnabled: input.aiAudioTranscriptionEnabled !== undefined
        ? Boolean(input.aiAudioTranscriptionEnabled)
        : Boolean(current.aiAudioTranscriptionEnabled),
      aiTranscriptionApiUrl: input.aiTranscriptionApiUrl !== undefined
        ? String(input.aiTranscriptionApiUrl || '').trim()
        : String(current.aiTranscriptionApiUrl || '').trim(),
      aiTranscriptionApiToken: input.aiTranscriptionApiToken !== undefined
        ? String(input.aiTranscriptionApiToken || '').trim()
        : String(current.aiTranscriptionApiToken || '').trim(),
      aiTranscriptionLanguage: input.aiTranscriptionLanguage !== undefined
        ? (String(input.aiTranscriptionLanguage || '').trim() || 'pt')
        : (String(current.aiTranscriptionLanguage || '').trim() || 'pt'),
      aiTranscriptionResponseFormat: input.aiTranscriptionResponseFormat !== undefined
        ? (String(input.aiTranscriptionResponseFormat || '').trim() || 'json')
        : (String(current.aiTranscriptionResponseFormat || '').trim() || 'json'),
      aiCustomModels: input.aiCustomModels !== undefined
        ? this.parseCustomModels(input.aiCustomModels)
        : this.parseCustomModels(current.aiCustomModels || []),
      ollamaApiToken: input.ollamaApiToken !== undefined
        ? String(input.ollamaApiToken || '').trim()
        : String(current.ollamaApiToken || '').trim(),
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
    await this.persistToDatabase(next);
    return { ...next };
  }

  safeForClient() {
    const current = this.load();
    return {
      aiAttendantEnabled: Boolean(current.aiAttendantEnabled),
      aiAllowAdminChat: Boolean(current.aiAllowAdminChat),
      aiBetaModeEnabled: Boolean(current.aiBetaModeEnabled),
      aiBetaAllowlist: this.parseAllowlist(current.aiBetaAllowlist || []),
      aiAgentName: String(current.aiAgentName || 'Marina'),
      aiAgentAvatar: String(current.aiAgentAvatar || '/images/marina.png'),
      aiPersonalityPrompt: String(current.aiPersonalityPrompt || ''),
      aiTemperature: this.clampNumber(current.aiTemperature, 0, 2, 0.25),
      aiMaxOutputTokens: this.clampInt(current.aiMaxOutputTokens, 64, 2048, 280),
      aiMaxReplyChars: this.clampInt(current.aiMaxReplyChars, 120, 4000, 420),
      aiPreferredProvider: this.normalizeProvider(current.aiPreferredProvider, this.getDefaultProvider()),
      aiPreferredModel: String(current.aiPreferredModel || '').trim()
        || this.getDefaultModelByProvider(this.normalizeProvider(current.aiPreferredProvider, this.getDefaultProvider())),
      aiTranscriptionProvider: this.normalizeProvider(
        current.aiTranscriptionProvider,
        this.normalizeProvider(current.aiPreferredProvider, this.getDefaultProvider())
      ),
      aiTranscriptionModel: String(current.aiTranscriptionModel || '').trim(),
      aiAudioTranscriptionEnabled: Boolean(current.aiAudioTranscriptionEnabled),
      aiTranscriptionApiUrl: String(current.aiTranscriptionApiUrl || '').trim(),
      aiTranscriptionLanguage: String(current.aiTranscriptionLanguage || '').trim() || 'pt',
      aiTranscriptionResponseFormat: String(current.aiTranscriptionResponseFormat || '').trim() || 'json',
      hasAiTranscriptionApiToken: Boolean(String(current.aiTranscriptionApiToken || '').trim()),
      aiCustomModels: this.parseCustomModels(current.aiCustomModels || []),
      hasOllamaApiToken: Boolean(String(current.ollamaApiToken || '').trim()),
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
