const Message = require('../models/Message');
const ChatRoom = require('../models/ChatRoom');
const User = require('../models/User');
const AIController = require('./AIController');
const knowledgeBase = require('../services/knowledgeBase');
const fastReplyService = require('../services/fastReplyService');
const alertService = require('../services/alertService');
const eventBrokerService = require('../services/eventBrokerService');
const settingsService = require('../services/settingsService');
const aiLearningLogService = require('../services/aiLearningLogService');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const dns = require('dns');
const { v4: uuidv4 } = require('uuid');
let UndiciAgent = null;
try {
  ({ Agent: UndiciAgent } = require('undici'));
} catch (_err) {
  UndiciAgent = null;
}

// Configurar multer
const defaultPublicDir = process.env.PUBLIC_DIR
  ? path.resolve(process.cwd(), process.env.PUBLIC_DIR)
  : path.resolve(process.cwd(), 'public_html');

let uploadsDir = process.env.FILES_DIR
  ? path.resolve(process.cwd(), process.env.FILES_DIR)
  : path.join(defaultPublicDir, 'uploads');

try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  fs.accessSync(uploadsDir, fs.constants.W_OK);
} catch (err) {
  const fallbackUploadsDir = path.join(process.cwd(), 'tmp', 'uploads');
  console.error(`[uploads] Falha ao usar FILES_DIR (${uploadsDir}): ${err.message}`);
  console.warn(`[uploads] Usando fallback em ${fallbackUploadsDir}`);
  uploadsDir = fallbackUploadsDir;
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
}

function getExtFromMime(mime) {
  const map = {
    'audio/webm': '.webm',
    'audio/ogg': '.ogg',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/wave': '.wav',
    'audio/x-wav': '.wav',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'text/plain': '.txt'
  };
  return map[mime] || '';
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    let ext = path.extname(file.originalname || '') || '';
    if (!ext) {
      ext = getExtFromMime(file.mimetype) || '';
    }
    const name = uuidv4() + ext;
    cb(null, name);
  }
});

const upload = multer({ storage, limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800') } });

class MessageController {
  constructor() {
    this.bootstrapLocks = new Set();
    this.pendingDialog = new Map();
    this.roomMemory = new Map();
    this.transcriptionCache = new Map();
  }

  logAiMetric(event, data = {}) {
    const payload = {
      ts: new Date().toISOString(),
      source: 'message-controller',
      event,
      ...data
    };
    console.info('[AI_METRIC]', JSON.stringify(payload));
  }

  getAiApiUrl() {
    return String(process.env.API_AI_URL || '').trim();
  }

  isAiEnabled() {
    const settings = settingsService.load();
    const enabledBySettings = Boolean(settings.aiAttendantEnabled);
    return enabledBySettings;
  }

  isAiAllowedForUser(user) {
    if (!this.isAiEnabled()) return false;
    const settings = settingsService.load();
    const betaEnabled = Boolean(settings.aiBetaModeEnabled);
    if (!betaEnabled) return true;

    const allowlist = Array.isArray(settings.aiBetaAllowlist)
      ? settings.aiBetaAllowlist.map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean)
      : [];
    if (!allowlist.length) return false;

    const userId = String(user?.id || '').trim().toLowerCase();
    const email = String(user?.email || '').trim().toLowerCase();
    return Boolean((userId && allowlist.includes(userId)) || (email && allowlist.includes(email)));
  }

  isAdminUser(user) {
    return String(user?.role || '').trim().toLowerCase() === 'admin';
  }

  isAiAllowedForAdmin(user) {
    if (!this.isAdminUser(user)) return false;
    const settings = settingsService.load();
    return Boolean(settings.aiAllowAdminChat);
  }

  getAiUserId() {
    return String(process.env.AI_USER_ID || 'ai-assistant');
  }

  getAiUserName() {
    const settings = settingsService.load();
    return String(settings.aiAgentName || process.env.AI_USER_NAME || 'Maria').trim() || 'Maria';
  }

  getAiUserAvatar() {
    const settings = settingsService.load();
    const configured = String(settings.aiAgentAvatar || '').trim();
    if (configured) return configured;
    const envAvatar = String(process.env.AI_USER_AVATAR || '').trim();
    if (envAvatar) return envAvatar;
    return '/images/marina.png';
  }

  getTranscriptionSettings() {
    const settings = settingsService.load();
    const enabled = Boolean(settings.aiAudioTranscriptionEnabled);
    const provider = String(settings.aiTranscriptionProvider || settings.aiPreferredProvider || 'ollama')
      .trim()
      .toLowerCase() || 'ollama';
    const model = String(settings.aiTranscriptionModel || '').trim();
    return { enabled, provider, model };
  }

  getTranscriptionApiUrl() {
    const settings = settingsService.load();
    return String(
      settings.aiTranscriptionApiUrl
      || process.env.AI_TRANSCRIPTION_API_URL
      || process.env.WHISPER_API_URL
      || 'https://whisper.taiksu.com.br/api/transcribe'
    ).trim();
  }

  getTranscriptionApiToken() {
    const settings = settingsService.load();
    return String(
      settings.aiTranscriptionApiToken
      || process.env.AI_TRANSCRIPTION_API_TOKEN
      || process.env.WHISPER_API_TOKEN
      || settings.ollamaApiToken
      || process.env.OLLAMA_API_TOKEN
      || ''
    ).trim();
  }

  getTranscriptionAuthMode() {
    return String(
      process.env.AI_TRANSCRIPTION_AUTH_MODE
      || process.env.WHISPER_AUTH_MODE
      || 'auto'
    ).trim().toLowerCase();
  }

  buildTranscriptionAuthHeaders(token) {
    const safeToken = String(token || '').trim();
    if (!safeToken) return {};
    const mode = this.getTranscriptionAuthMode();
    const headers = {};

    if (mode === 'x-api-key') {
      headers['x-api-key'] = safeToken.replace(/^x-api-key\s+/i, '').trim();
      return headers;
    }

    if (mode === 'bearer') {
      const bearerToken = safeToken.replace(/^bearer\s+/i, '').trim();
      headers.Authorization = `Bearer ${bearerToken}`;
      return headers;
    }

    // modo auto: tenta ser compativel com provedores que aceitam Bearer ou x-api-key
    const rawLower = safeToken.toLowerCase();
    if (rawLower.startsWith('bearer ')) {
      headers.Authorization = safeToken;
      headers['x-api-key'] = safeToken.slice(7).trim();
      return headers;
    }
    if (rawLower.startsWith('x-api-key ')) {
      const key = safeToken.slice(10).trim();
      headers['x-api-key'] = key;
      headers.Authorization = `Bearer ${key}`;
      return headers;
    }
    headers.Authorization = `Bearer ${safeToken}`;
    headers['x-api-key'] = safeToken;
    return headers;
  }

  getTranscriptionLanguage() {
    const settings = settingsService.load();
    return String(settings.aiTranscriptionLanguage || process.env.AI_TRANSCRIPTION_LANGUAGE || 'pt').trim() || 'pt';
  }

  getTranscriptionResponseFormat() {
    const settings = settingsService.load();
    return String(settings.aiTranscriptionResponseFormat || process.env.AI_TRANSCRIPTION_RESPONSE_FORMAT || 'json').trim() || 'json';
  }

  parseTranscriptionResolveRule(endpoint) {
    const raw = String(
      process.env.AI_TRANSCRIPTION_RESOLVE
      || process.env.WHISPER_RESOLVE
      || ''
    ).trim();
    if (!raw) return null;
    try {
      const parsedEndpoint = new URL(String(endpoint || '').trim());
      const endpointHost = String(parsedEndpoint.hostname || '').trim().toLowerCase();
      const endpointPort = Number(parsedEndpoint.port || (parsedEndpoint.protocol === 'https:' ? 443 : 80));
      if (!endpointHost) return null;

      const triple = raw.match(/^([^:]+):(\d+):([^:]+)$/);
      if (triple) {
        const host = String(triple[1] || '').trim().toLowerCase();
        const port = Number(triple[2] || 0);
        const ip = String(triple[3] || '').trim();
        if (!host || !port || !ip) return null;
        if (host !== endpointHost || port !== endpointPort) return null;
        return { host, ip };
      }

      const maybeIp = raw;
      if (!maybeIp) return null;
      return { host: endpointHost, ip: maybeIp };
    } catch (_err) {
      return null;
    }
  }

  getTranscriptionDispatcher(endpoint) {
    const rule = this.parseTranscriptionResolveRule(endpoint);
    if (!rule || !UndiciAgent) return null;
    const insecureTls = String(process.env.AI_TRANSCRIPTION_TLS_INSECURE || 'false').trim().toLowerCase() === 'true';
    return new UndiciAgent({
      connect: {
        ...(insecureTls ? { rejectUnauthorized: false } : {}),
        lookup(hostname, options, callback) {
          const safeHost = String(hostname || '').trim().toLowerCase();
          if (safeHost === String(rule.host || '').trim().toLowerCase()) {
            callback(null, rule.ip, 4);
            return;
          }
          dns.lookup(hostname, options, callback);
        }
      }
    });
  }

  buildOllamaAuthHeaders() {
    const headers = {};
    const token = String(settingsService.load()?.ollamaApiToken || process.env.OLLAMA_API_TOKEN || '').trim();
    if (!token) return headers;
    const mode = String(process.env.OLLAMA_AUTH_MODE || 'bearer').trim().toLowerCase();
    if (mode === 'x-api-key') {
      headers['x-api-key'] = token;
      return headers;
    }
    headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  resolveUploadPathFromUrl(fileUrl) {
    const safeUrl = String(fileUrl || '').split('?')[0].trim();
    if (!safeUrl) return '';
    const filename = path.basename(safeUrl);
    if (!filename) return '';
    return path.join(uploadsDir, filename);
  }

  getTranscriptionCacheKey(messageId, provider, model) {
    return `${String(messageId || '').trim()}::${String(provider || '').trim()}::${String(model || '').trim()}`;
  }

  sanitizeTranscriptionText(value) {
    return String(value || '')
      .replace(/\u0000/g, '')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  looksLikeHtmlPayload(value) {
    const text = this.sanitizeTranscriptionText(value).toLowerCase();
    if (!text) return false;
    return /<(?:!doctype|html|head|body|script|style|iframe|img|meta|link)\b/.test(text)
      || /<\/(?:html|head|body|script|style)>/.test(text);
  }

  extractTranscriptionText(payload) {
    if (!payload) return '';
    if (typeof payload === 'string') {
      const direct = this.sanitizeTranscriptionText(payload);
      return this.looksLikeHtmlPayload(direct) ? '' : direct;
    }
    if (typeof payload !== 'object') return '';
    const candidates = [
      payload.text,
      payload.transcript,
      payload.transcription,
      payload.output,
      payload.response,
      payload.data?.text,
      payload.data?.transcript
    ];
    for (const item of candidates) {
      const value = this.sanitizeTranscriptionText(item);
      if (!value) continue;
      if (this.looksLikeHtmlPayload(value)) continue;
      if (value) return value;
    }
    return '';
  }

  async requestExternalTranscription({ filePath, fileType, fileName, model }) {
    const FormDataCtor = typeof FormData !== 'undefined' ? FormData : null;
    const BlobCtor = typeof Blob !== 'undefined' ? Blob : (require('buffer').Blob);
    if (!FormDataCtor || !BlobCtor) {
      throw new Error('Runtime sem suporte a FormData/Blob para transcricao');
    }
    const endpoint = this.getTranscriptionApiUrl();
    if (!endpoint) throw new Error('Endpoint de transcricao nao configurado');

    const token = this.getTranscriptionApiToken();
    const authHeaders = this.buildTranscriptionAuthHeaders(token);

    const fileBuffer = await fs.promises.readFile(filePath);
    const safeType = String(fileType || '').trim() || 'application/octet-stream';
    const safeName = String(fileName || path.basename(filePath) || 'audio.bin').trim();
    const formData = new FormDataCtor();
    const blob = new BlobCtor([fileBuffer], { type: safeType });
    formData.append('file', blob, safeName);
    if (model) formData.append('model', model);
    formData.append('language', this.getTranscriptionLanguage());
    formData.append('response_format', this.getTranscriptionResponseFormat());

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);
    const dispatcher = this.getTranscriptionDispatcher(endpoint);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: authHeaders,
        body: formData,
        signal: controller.signal,
        ...(dispatcher ? { dispatcher } : {})
      });

      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      const data = contentType.includes('application/json')
        ? await response.json().catch(() => ({}))
        : { text: await response.text().catch(() => '') };

      if (!response.ok) {
        const detail = String(data?.error || data?.message || '').trim();
        const error = new Error(`${endpoint} -> HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
        error.status = Number(response.status) || 502;
        throw error;
      }

      if (contentType.includes('text/html') || contentType.includes('application/xhtml+xml')) {
        const error = new Error(`${endpoint} -> resposta invalida de transcricao (HTML retornado)`);
        error.status = 502;
        throw error;
      }

      const transcript = this.extractTranscriptionText(data);
      if (!transcript) {
        const error = new Error(`${endpoint} -> resposta sem texto valido de transcricao`);
        error.status = 502;
        throw error;
      }

      return { text: transcript.slice(0, 8000), endpoint };
    } finally {
      clearTimeout(timeout);
      if (dispatcher && typeof dispatcher.close === 'function') {
        dispatcher.close().catch(() => {});
      }
    }
  }

  getChamadoCreateUrl() {
    return String(process.env.CHAMADO_CREATE_URL || 'https://ajuda.taiksu.com.br/chamados/criar/').trim();
  }

  getChatRoomUrl(roomId) {
    const base = String(process.env.APP_URL || '').trim().replace(/\/+$/, '');
    const relative = `/chat/room/${encodeURIComponent(String(roomId || ''))}`;
    return base ? `${base}${relative}` : relative;
  }

  normalizeChatState(value) {
    const state = String(value || '').trim().toUpperCase();
    const allowed = ['NEW', 'IA', 'AGUARDANDO_HUMANO', 'FILA', 'HUMANO', 'FECHADO'];
    return allowed.includes(state) ? state : 'NEW';
  }

  getWelcomeMessage(isChamadoRoom) {
    const agentName = this.getAiUserName();
    if (isChamadoRoom) {
      return `Ol\u00E1! Eu sou a Assistente ${agentName} da Taiksu IA. Seja bem-vindo(a)! Em que posso ajudar hoje?`;
    }
    return `Ol\u00E1! Eu sou a Assistente ${agentName} da Taiksu IA. Seja bem-vindo(a)! Em que posso ajudar hoje?`;
  }

  isHumanRequest(text) {
    const normalized = String(text || '').toLowerCase();
    if (!normalized) return false;
    return /(humano|atendente|pessoa|suporte humano|falar com|transferir|representante)/i.test(normalized);
  }

  isTutorialRequest(text) {
    const normalized = String(text || '').toLowerCase();
    if (!normalized) return false;
    return /(tutorial|passo a passo|guia|manual|documentacao|documenta\u00e7\u00e3o|video|v[i\u00ed]deo|ajuda|artigo)/i.test(normalized);
  }

  isOpenChamadoIntent(text) {
    const normalized = String(text || '').toLowerCase();
    if (!normalized) return false;
    return /(abrir chamado|abrir um chamado|como abro.*chamado|como abrir.*chamado|criar chamado|novo chamado|abrir ticket|criar ticket)/i.test(normalized);
  }

  isYesAnswer(text) {
    const normalized = String(text || '').trim().toLowerCase();
    return /^(sim|s|isso|claro|ok|pode ser|quero|pode)$/i.test(normalized);
  }

  isNoAnswer(text) {
    const normalized = String(text || '').trim().toLowerCase();
    return /^(nao|não|n|negativo|deixa|agora nao|agora não)$/i.test(normalized);
  }

  shouldTrackTopic(text) {
    const normalized = String(text || '').trim();
    if (!normalized) return false;
    if (normalized.length < 8) return false;
    if (this.isYesAnswer(normalized) || this.isNoAnswer(normalized)) return false;
    return true;
  }

  getMemoryTtlMs() {
    const minutes = Number(process.env.AI_MEMORY_TTL_MINUTES || 30);
    const safeMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 30;
    return safeMinutes * 60 * 1000;
  }

  getRoomMemory(roomId) {
    if (!roomId) return null;
    const key = String(roomId);
    const memory = this.roomMemory.get(key);
    if (!memory) return null;
    if ((Date.now() - Number(memory.updatedAt || 0)) > this.getMemoryTtlMs()) {
      this.roomMemory.delete(key);
      return null;
    }
    return memory;
  }

  setRoomMemory(roomId, patch = {}) {
    if (!roomId) return null;
    const key = String(roomId);
    const current = this.getRoomMemory(key) || {
      roomId: key,
      topic: '',
      intent: 'geral',
      summary: '',
      preferredReplyStyle: '',
      lastUserMessage: '',
      lastAiMessage: '',
      updatedAt: Date.now()
    };
    const next = {
      ...current,
      ...patch,
      updatedAt: Date.now()
    };
    this.roomMemory.set(key, next);
    return next;
  }

  inferMemoryIntent(text) {
    const normalized = String(text || '').toLowerCase();
    if (!normalized) return 'geral';
    if (this.isHumanRequest(normalized)) return 'falar_humano';
    if (this.isTutorialRequest(normalized)) return 'tutorial';
    if (this.isOpenChamadoIntent(normalized)) return 'chamado';
    if (/(auditoria|modo estrito|financeiro|dre)/i.test(normalized)) return 'auditoria';
    if (/(erro|bug|falha|problema|nao funciona|não funciona)/i.test(normalized)) return 'suporte_tecnico';
    return 'geral';
  }

  extractTopicFromText(text) {
    const cleaned = String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) return '';
    if (cleaned.length <= 6) return '';
    if (this.isYesAnswer(cleaned) || this.isNoAnswer(cleaned)) return '';
    return cleaned.slice(0, 140);
  }

  updateMemoryFromUserMessage(roomId, text) {
    const content = String(text || '').trim();
    if (!content) return;
    const current = this.getRoomMemory(roomId) || {};
    const topic = this.extractTopicFromText(content) || current.topic || '';
    const intent = this.inferMemoryIntent(content) || current.intent || 'geral';
    const preferredReplyStyle = this.detectReplyStylePreference(content) || current.preferredReplyStyle || '';
    const summary = topic
      ? `Topico atual: ${topic}. Intencao: ${intent}.`
      : (current.summary || `Intencao: ${intent}.`);
    this.setRoomMemory(roomId, {
      topic,
      intent,
      preferredReplyStyle,
      summary,
      lastUserMessage: content.slice(0, 260)
    });
  }

  updateMemoryFromAiMessage(roomId, text) {
    const content = String(text || '').trim();
    if (!content) return;
    const current = this.getRoomMemory(roomId) || {};
    this.setRoomMemory(roomId, {
      ...current,
      lastAiMessage: content.slice(0, 260)
    });
  }

  buildMemoryPayload(roomId) {
    const memory = this.getRoomMemory(roomId);
    if (!memory) return null;
    return {
      topic: String(memory.topic || ''),
      intent: String(memory.intent || 'geral'),
      preferredReplyStyle: String(memory.preferredReplyStyle || ''),
      summary: String(memory.summary || ''),
      lastUserMessage: String(memory.lastUserMessage || ''),
      lastAiMessage: String(memory.lastAiMessage || '')
    };
  }

  getMemoryDebugList() {
    const ttlMs = this.getMemoryTtlMs();
    const now = Date.now();
    const rows = [];
    this.roomMemory.forEach((memory, roomId) => {
      const updatedAtMs = Number(memory?.updatedAt || 0);
      const ageMs = now - updatedAtMs;
      if (!updatedAtMs || ageMs > ttlMs) return;
      rows.push({
        roomId: String(roomId),
        topic: String(memory?.topic || ''),
        intent: String(memory?.intent || 'geral'),
        preferredReplyStyle: String(memory?.preferredReplyStyle || ''),
        summary: String(memory?.summary || ''),
        lastUserMessage: String(memory?.lastUserMessage || ''),
        lastAiMessage: String(memory?.lastAiMessage || ''),
        updatedAt: new Date(updatedAtMs).toISOString(),
        ageMs
      });
    });
    return rows.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  clearRoomMemory(roomId) {
    if (!roomId) return false;
    return this.roomMemory.delete(String(roomId));
  }

  clearAllMemory() {
    const count = this.roomMemory.size;
    this.roomMemory.clear();
    return count;
  }

  expandShortUserMessage(content, roomId) {
    const text = String(content || '').trim();
    if (!text) return '';
    const memory = this.getRoomMemory(roomId);
    if (!memory) return text;

    const short = text.length <= 18;
    const isContextual = this.isYesAnswer(text)
      || this.isNoAnswer(text)
      || /^(entendi|ok|certo|isso|e ai|e agora|como assim|sobre isso|sobre ele)\??$/i.test(text)
      || short;
    if (!isContextual) return text;

    const topic = String(memory.topic || '').trim();
    const intent = String(memory.intent || 'geral');
    const lastUser = String(memory.lastUserMessage || '').trim();
    if (!topic && !lastUser) return text;
    return `Contexto da conversa: topico="${topic || lastUser}", intencao="${intent}". Mensagem atual do usuario: ${text}`;
  }

  getPendingDialog(roomId) {
    if (!roomId) return null;
    const value = this.pendingDialog.get(String(roomId));
    if (!value) return null;
    if ((Date.now() - Number(value.ts || 0)) > 15 * 60 * 1000) {
      this.pendingDialog.delete(String(roomId));
      return null;
    }
    return value;
  }

  setPendingDialog(roomId, data = {}) {
    if (!roomId) return;
    this.pendingDialog.set(String(roomId), {
      ts: Date.now(),
      ...data
    });
  }

  clearPendingDialog(roomId) {
    if (!roomId) return;
    this.pendingDialog.delete(String(roomId));
  }

  trimContextText(text, maxChars = 220) {
    const raw = String(text || '').replace(/\s+/g, ' ').trim();
    if (!raw) return '';
    if (raw.length <= maxChars) return raw;
    return `${raw.slice(0, maxChars - 3).trim()}...`;
  }

  buildCompactContext(contextMessages, userId) {
    const all = Array.isArray(contextMessages) ? contextMessages : [];
    const last = all.slice(-6);
    let totalChars = 0;
    const maxTotal = 1200;

    return last
      .map((item) => {
        const role = String(item.user_id || '') === String(userId || '') ? 'user' : 'assistant';
        const content = this.trimContextText(item.content || '', 220);
        if (!content) return null;
        totalChars += content.length;
        if (totalChars > maxTotal) return null;
        return {
          role,
          content,
          createdAt: item.created_at
        };
      })
      .filter(Boolean);
  }

  stripLinksFromText(text) {
    return String(text || '')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/gi, '$1')
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/\[\]\(\)/g, '')
      .replace(/\s+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  sanitizeAiReply(text) {
    let safe = String(text || '').trim();
    if (!safe) return '';
    safe = this.stripLinksFromText(safe);
    safe = safe.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n');

    const lower = safe.toLowerCase();
    const looksCut = /(ou prefere|ou se|ou posso|ou quer|ou deseja|prefere\s*)$/i.test(lower)
      || /[:;,]$/.test(safe);
    if (looksCut) {
      safe = `${safe}\n\nSe preferir, posso te encaminhar para um atendente humano agora.`;
    }
    if (!/[.!?]$/.test(safe)) safe = `${safe}.`;
    return safe;
  }

  normalizeCompareText(text) {
    return String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  detectReplyStylePreference(text) {
    const normalized = this.normalizeCompareText(text);
    if (!normalized) return '';
    if (/(passo a passo|tutorial|guia|etapas|como fazer)/i.test(normalized)) return 'passo_a_passo';
    if (/(visao geral|visao macro|resumo|objetivo)/i.test(normalized)) return 'visao_geral';
    return '';
  }

  isClarificationPrompt(text) {
    const normalized = this.normalizeCompareText(text);
    if (!normalized) return false;
    return /(visao geral|passo a passo).{0,30}(ou|ou se).{0,30}(visao geral|passo a passo)/i.test(normalized);
  }

  buildLoopBreakReply({ userMessage, roomId, requestedTopic }) {
    const memory = this.getRoomMemory(roomId);
    const preferred = this.detectReplyStylePreference(userMessage) || String(memory?.preferredReplyStyle || '');
    const topic = String(requestedTopic || memory?.topic || 'esse tema').trim();
    if (preferred === 'passo_a_passo') {
      return `Perfeito. Vou responder direto em passo a passo sobre ${topic}.`;
    }
    if (preferred === 'visao_geral') {
      return `Perfeito. Vou responder direto com uma visao geral sobre ${topic}.`;
    }
    return `Perfeito. Vou responder direto sobre ${topic}.`;
  }

  evaluateReplyQuality({ userMessage, replyText, roomId }) {
    const requestedTopic = this.extractRequestedTopic(userMessage);
    const userTopicLabel = this.detectTopicLabel(requestedTopic || userMessage);
    const replyTopicLabel = this.detectTopicLabel(replyText);
    const topicMismatch = Boolean(userTopicLabel && replyTopicLabel && userTopicLabel !== replyTopicLabel);
    const repeatedReply = this.isVerySimilarReply(replyText, this.getRoomMemory(roomId)?.lastAiMessage || '');
    const clarificationPrompt = this.isClarificationPrompt(replyText);
    const previousClarificationPrompt = this.isClarificationPrompt(this.getRoomMemory(roomId)?.lastAiMessage || '');
    const repeatedClarification = Boolean(clarificationPrompt && previousClarificationPrompt);
    const replyStylePreference = this.detectReplyStylePreference(userMessage) || String(this.getRoomMemory(roomId)?.preferredReplyStyle || '');
    const likelyLoop = Boolean(repeatedClarification || (clarificationPrompt && replyStylePreference));
    return {
      requestedTopic,
      userTopicLabel,
      replyTopicLabel,
      topicMismatch,
      repeatedReply,
      clarificationPrompt,
      repeatedClarification,
      replyStylePreference,
      likelyLoop
    };
  }

  async logLearningEvent(event, data = {}) {
    await aiLearningLogService.append(event, data);
  }

  stripLeadingGreeting(replyText) {
    let safe = String(replyText || '').trim();
    if (!safe) return safe;
    safe = safe
      .replace(/^ol[aá][,!.\s-]+/i, '')
      .replace(/^(oi|ola)[,!.\s-]+/i, '')
      .replace(/^(bom dia|boa tarde|boa noite)[,!.\s-]+/i, '')
      .trim();
    return safe;
  }

  isPurposeQuestion(text) {
    const normalized = this.normalizeCompareText(text);
    if (!normalized) return false;
    return /(qual objetivo|pra que serve|para que serve|serve pra que|qual a finalidade|objetivo dessa funcao|objetivo dessa funcao)/i.test(normalized);
  }

  isTopicShiftMessage(text) {
    const normalized = this.normalizeCompareText(text);
    if (!normalized) return false;
    return /(mudar de assunto|outro assunto|nao quero saber|nao era isso|nao e isso|quero saber sobre|gostaria de saber sobre|eu queria saber sobre|falar sobre)/i.test(normalized);
  }

  extractRequestedTopic(text) {
    const source = String(text || '').replace(/\s+/g, ' ').trim();
    if (!source) return '';
    const patterns = [
      /(?:quero|gostaria|queria)\s+saber\s+sobre\s+(.+)$/i,
      /(?:falar|entender)\s+sobre\s+(.+)$/i,
      /(?:nao|não).{0,25}(?:quero|era).{0,15}sobre\s+(.+)$/i,
      /sobre\s+(.+)$/i
    ];
    for (const pattern of patterns) {
      const match = source.match(pattern);
      if (match && match[1]) {
        return String(match[1])
          .replace(/[.!?]+$/g, '')
          .trim()
          .slice(0, 140);
      }
    }
    return '';
  }

  detectTopicLabel(text) {
    const normalized = this.normalizeCompareText(text);
    if (!normalized) return '';
    const map = [
      ['modo_restrito', /(modo restrito|modo estrito|auditoria)/i],
      ['caixa', /(abrir caixa|fechar caixa|caixa)/i],
      ['visao_geral', /(visao geral|visão geral|dashboard|painel)/i],
      ['chamado', /(chamado|ticket|protocolo)/i]
    ];
    for (const [label, pattern] of map) {
      if (pattern.test(normalized)) return label;
    }
    return '';
  }

  isVerySimilarReply(currentReply, previousReply) {
    const a = this.normalizeCompareText(currentReply);
    const b = this.normalizeCompareText(previousReply);
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.length < 40 || b.length < 40) return false;
    return a.includes(b) || b.includes(a);
  }

  buildContextAwareFallback({ userMessage, roomId }) {
    const message = String(userMessage || '').trim();
    const memory = this.getRoomMemory(roomId);
    const topic = String(memory?.topic || '').toLowerCase();
    if (!this.isPurposeQuestion(message)) return '';

    if (/(modo estrito|auditoria)/i.test(topic) || /(modo estrito|auditoria)/i.test(message)) {
      return 'Em resumo, o Modo Estrito existe para garantir confianca nos numeros: ele usa somente dados auditados nos calculos e relatorios. Assim voce evita distorcoes por registros ainda nao validados.';
    }

    return 'O objetivo dessa funcao e reduzir erro e dar previsibilidade no processo. Se voce quiser, eu explico com um exemplo pratico do seu caso.';
  }

  adaptAiReplyForConversation({ replyText, userMessage, roomId }) {
    let safe = this.sanitizeAiReply(replyText);
    const memory = this.getRoomMemory(roomId);
    const hasAssistantHistory = Boolean(String(memory?.lastAiMessage || '').trim());
    let quality = this.evaluateReplyQuality({
      userMessage,
      replyText: safe,
      roomId
    });

    if (hasAssistantHistory) {
      safe = this.stripLeadingGreeting(safe);
    }

    if (!safe) {
      safe = 'Recebi sua mensagem. Posso te ajudar com isso agora.';
    }

    const fallback = this.buildContextAwareFallback({ userMessage, roomId });
    if (fallback) {
      safe = fallback;
    } else if (this.isVerySimilarReply(safe, memory?.lastAiMessage || '')) {
      const topic = String(memory?.topic || '').trim();
      if (topic) {
        safe = `Entendi. Sobre "${topic}", resumindo em uma frase: ${safe}`;
      } else {
        safe = `Entendi. Reformulando de forma direta: ${safe}`;
      }
    }

    quality = this.evaluateReplyQuality({
      userMessage,
      replyText: safe,
      roomId
    });

    if (quality.topicMismatch && quality.requestedTopic) {
      safe = `Vou focar em ${quality.requestedTopic}. ${safe}`;
    }

    if (quality.likelyLoop) {
      safe = this.buildLoopBreakReply({
        userMessage,
        roomId,
        requestedTopic: quality.requestedTopic
      });
    }

    safe = this.sanitizeAiReply(safe);
    if (!safe) {
      safe = 'Recebi sua mensagem. Posso te ajudar com isso agora.';
    }

    quality = this.evaluateReplyQuality({
      userMessage,
      replyText: safe,
      roomId
    });
    return {
      replyText: safe,
      quality
    };
  }

  normalizeUserFirstName(name) {
    return String(name || '')
      .trim()
      .split(/\s+/)[0]
      .replace(/[^a-zA-ZÀ-ÿ0-9]/g, '')
      .toLowerCase();
  }

  fixHallucinatedUserName(replyText, userName) {
    let safe = String(replyText || '').trim();
    if (!safe) return safe;

    const expected = this.normalizeUserFirstName(userName);
    const greetMatch = safe.match(/^ol[aá],\s*([^\s!,.?]+)([!,.?])?/i);
    if (greetMatch) {
      const used = this.normalizeUserFirstName(greetMatch[1]);
      if (used && expected && used !== expected) {
        safe = safe.replace(/^ol[aá],\s*[^\s!,.?]+([!,.?])?\s*/i, 'Olá! ');
      }
    }

    if (/^sim,\s*[^\s,.!?]+\s+sabe/i.test(safe)) {
      safe = safe.replace(/^sim,\s*[^\s,.!?]+\s+sabe/i, 'Sim, eu sei');
    }

    return safe;
  }

  maybeStripChamadoLink(replyText, { kbHits = 0, askedTutorial = false, askedOpenChamado = false, askedHuman = false } = {}) {
    if (askedTutorial || askedOpenChamado || askedHuman) return String(replyText || '').trim();
    if (Number(kbHits || 0) <= 0) return String(replyText || '').trim();
    return String(replyText || '')
      .replace(/https?:\/\/ajuda\.taiksu\.com\.br\/chamados\/criar\/?/gi, '')
      .replace(/\s+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  isValidKbUrl(url) {
    const raw = String(url || '').trim();
    if (!raw) return false;
    return /^https?:\/\/[^\s]+$/i.test(raw);
  }

  pickBestKbUrl(kbLinks = []) {
    if (!Array.isArray(kbLinks)) return '';
    const validLinks = kbLinks
      .map((item) => String(item?.url || '').trim())
      .filter((url) => this.isValidKbUrl(url));

    if (!validLinks.length) return '';

    const articleLink = validLinks.find((url) => /\/artigos?\//i.test(url));
    if (articleLink) return articleLink;

    const nonChamadoLink = validLinks.find((url) => !/\/chamados\/criar\/?/i.test(url));
    if (nonChamadoLink) return nonChamadoLink;

    return validLinks[0];
  }

  appendKnowledgeReference(replyText, kbLinks = [], userMessage = '') {
    const safe = String(replyText || '').trim();
    const link = this.pickBestKbUrl(kbLinks);
    if (!safe || !link) return safe;
    if (safe.includes(link)) return safe;

    const sourceAlways = String(process.env.AI_APPEND_SOURCE_LINK_ALWAYS || 'true').trim().toLowerCase() !== 'false';
    const wantsReference = /(tutorial|passo a passo|guia|manual|video|v[i?]deo|artigo|ajuda|link|onde vejo|onde encontro|fonte)/i.test(String(userMessage || ''));
    if (!sourceAlways && !wantsReference) return safe;

    const isVideo = /(?:youtube\.com|youtu\.be|\/video|\/videos)/i.test(link);
    const label = isVideo ? 'Video tutorial' : 'Fonte';
    return `${safe}\n\n${label}: ${link}`;
  }

  shouldOfferChoiceFollowUp(replyText) {
    const text = String(replyText || '').toLowerCase();
    return /(mais detalhes|falar com.*atendente|atendente humano|prefere|posso te ajudar.*ou)/i.test(text);
  }

  getLastKnownTopic(content, roomId) {
    const pending = this.getPendingDialog(roomId);
    const pendingTopic = String(pending?.topic || '').trim();
    if (pendingTopic) return pendingTopic;
    return this.trimContextText(content || '', 120);
  }

  isChamadoRoom(room, chamadoId) {
    if (chamadoId) return true;
    return String(room?.type || '').toLowerCase() === 'support_ticket';
  }

  buildChamadoActions({ isChamadoRoom = false } = {}) {
    const actions = [
      {
        id: 'falar_humano',
        label: 'Falar com humano',
        type: 'send_text',
        value: 'Quero falar com um atendente humano.'
      }
    ];
    if (!isChamadoRoom) {
      actions.push({
        id: 'abrir_chamado',
        label: 'Abrir chamado',
        type: 'open_url',
        url: this.getChamadoCreateUrl(),
        target: '_blank'
      });
    }
    return actions;
  }

  shouldRunAiFlow({ room, req, messageType, content }) {
    if (!this.isAiAllowedForUser(req.session?.user)) return false;
    if (String(messageType || 'text').toLowerCase() !== 'text') return false;
    if (!String(content || '').trim()) return false;
    if (!room) return false;

    const roomState = this.normalizeChatState(room.chat_state);
    if (['HUMANO', 'FECHADO'].includes(roomState)) return false;

    const role = String(req.session?.user?.role || '').toLowerCase();
    if (this.isHumanRole(role) && !this.isAiAllowedForAdmin(req.session?.user)) return false;

    return true;
  }

  shouldRunAiAudioFlow({ room, req, messageType }) {
    if (!this.isAiAllowedForUser(req.session?.user)) return false;
    if (String(messageType || 'text').toLowerCase() !== 'audio') return false;
    if (!this.getTranscriptionSettings().enabled) return false;
    if (!room) return false;

    const roomState = this.normalizeChatState(room.chat_state);
    if (['HUMANO', 'FECHADO'].includes(roomState)) return false;

    const role = String(req.session?.user?.role || '').toLowerCase();
    if (this.isHumanRole(role) && !this.isAiAllowedForAdmin(req.session?.user)) return false;
    return true;
  }

  isHumanRole(roleValue) {
    const role = String(roleValue || '').toLowerCase();
    const humanRoles = ['admin', 'atendente', 'agent', 'suporte', 'support'];
    return humanRoles.includes(role);
  }

  shouldNotifyUnsupportedMedia({ room, req, messageType }) {
    if (!this.isAiAllowedForUser(req.session?.user)) return false;
    const normalizedType = String(messageType || 'text').toLowerCase();
    if (!['image', 'audio', 'video', 'document', 'file'].includes(normalizedType)) return false;
    if (normalizedType === 'audio' && this.getTranscriptionSettings().enabled) return false;
    if (!room) return false;
    const roomState = this.normalizeChatState(room.chat_state);
    if (['HUMANO', 'FECHADO'].includes(roomState)) return false;

    const role = String(req.session?.user?.role || '').toLowerCase();
    if (this.isHumanRole(role) && !this.isAiAllowedForAdmin(req.session?.user)) return false;
    return true;
  }

  async ensureAiUser() {
    const aiEmail = String(process.env.AI_USER_EMAIL || `${this.getAiUserId()}@taiksu.local`);
    let aiUser = await User.findByEmail(aiEmail);
    if (aiUser) {
      const desiredName = this.getAiUserName();
      const currentAvatar = String(aiUser.avatar || '').trim();
      const desiredAvatar = this.getAiUserAvatar();
      const shouldUpdateName = String(aiUser.name || '').trim() !== desiredName;
      const shouldUpdateAvatar = desiredAvatar && currentAvatar !== desiredAvatar;
      if (shouldUpdateName || shouldUpdateAvatar) {
        await User.update(aiUser.id, {
          name: desiredName,
          avatar: desiredAvatar || aiUser.avatar
        });
        aiUser = await User.findByEmail(aiEmail);
      }
      return aiUser;
    }

    aiUser = await User.create({
      name: this.getAiUserName(),
      email: aiEmail,
      password: String(process.env.AI_USER_PASSWORD || 'ai-system-password'),
      avatar: this.getAiUserAvatar(),
      role: 'system'
    });
    return aiUser;
  }

  async callAiApi({ roomId, chamadoId, content, req, roomState }) {
    const startedAt = Date.now();
    const apiUrl = this.getAiApiUrl();
    const internalFallbackEnabled = String(process.env.AI_INTERNAL_FALLBACK || 'true').trim().toLowerCase() !== 'false';
    const internalToken = String(process.env.API_AI_TOKEN || '').trim();
    const kbTopK = Number(process.env.KB_TOP_K || 3);
    const kbMinScore = Number(process.env.KB_MIN_SCORE || 2);
    const contextMessages = await Message.findByRoomId(roomId, 20);
    const context = this.buildCompactContext(contextMessages, req.session.user?.id);
    const contextDocs = knowledgeBase.retrieve(content, { limit: kbTopK, minScore: kbMinScore });

    const payload = {
      roomId,
      chamadoId: chamadoId ? String(chamadoId) : null,
      chatState: roomState,
      message: String(content || ''),
      user: {
        id: String(req.session.user?.id || ''),
        name: String(req.session.user?.name || 'Usuario'),
        role: String(req.session.user?.role || 'user'),
        email: String(req.session.user?.email || '')
      },
      context,
      memory: this.buildMemoryPayload(roomId),
      contextDocs,
      options: {
        offerHumanHandoff: true
      }
    };

    const headers = { 'Content-Type': 'application/json' };
    if (internalToken) {
      headers['x-ai-token'] = internalToken;
    }

    if (!apiUrl) {
      const direct = await AIController.generateFirstContact(payload, {});
      const directReply = this.sanitizeAiReply(direct?.reply || '');
      this.logAiMetric('proxy_success', {
        roomId,
        chamadoId: chamadoId ? String(chamadoId) : '',
        chatState: roomState,
        apiUrl: 'internal:direct',
        latencyMs: Date.now() - startedAt,
        inputChars: String(content || '').length,
        outputChars: directReply.length,
        kbHits: contextDocs.length,
        kbDocIds: contextDocs.map((doc) => doc.id),
        usage: direct?.usage || null
      });
      return {
        reply: directReply,
        kbHits: contextDocs.length,
        kbDocIds: contextDocs.map((doc) => doc.id),
        kbLinks: contextDocs
          .filter((doc) => this.isValidKbUrl(doc?.url))
          .map((doc) => ({ id: String(doc.id || ''), title: String(doc.title || ''), url: String(doc.url || '') })),
        usage: direct?.usage || null
      };
    }

    let response;
    try {
      response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
    } catch (fetchError) {
      if (!internalFallbackEnabled) throw fetchError;
      const direct = await AIController.generateFirstContact(payload, {});
      const directReply = this.sanitizeAiReply(direct?.reply || '');
      this.logAiMetric('proxy_success', {
        roomId,
        chamadoId: chamadoId ? String(chamadoId) : '',
        chatState: roomState,
        apiUrl: 'internal:fallback_after_fetch_error',
        latencyMs: Date.now() - startedAt,
        inputChars: String(content || '').length,
        outputChars: directReply.length,
        kbHits: contextDocs.length,
        kbDocIds: contextDocs.map((doc) => doc.id),
        usage: direct?.usage || null
      });
      return {
        reply: directReply,
        kbHits: contextDocs.length,
        kbDocIds: contextDocs.map((doc) => doc.id),
        kbLinks: contextDocs
          .filter((doc) => this.isValidKbUrl(doc?.url))
          .map((doc) => ({ id: String(doc.id || ''), title: String(doc.title || ''), url: String(doc.url || '') })),
        usage: direct?.usage || null
      };
    }

    if (!response.ok) {
      if (internalFallbackEnabled) {
        const direct = await AIController.generateFirstContact(payload, {});
        const directReply = this.sanitizeAiReply(direct?.reply || '');
        this.logAiMetric('proxy_success', {
          roomId,
          chamadoId: chamadoId ? String(chamadoId) : '',
          chatState: roomState,
          apiUrl: `internal:fallback_after_http_${response.status}`,
          latencyMs: Date.now() - startedAt,
          inputChars: String(content || '').length,
          outputChars: directReply.length,
          kbHits: contextDocs.length,
          kbDocIds: contextDocs.map((doc) => doc.id),
          usage: direct?.usage || null
        });
        return {
          reply: directReply,
          kbHits: contextDocs.length,
          kbDocIds: contextDocs.map((doc) => doc.id),
          kbLinks: contextDocs
            .filter((doc) => this.isValidKbUrl(doc?.url))
            .map((doc) => ({ id: String(doc.id || ''), title: String(doc.title || ''), url: String(doc.url || '') })),
          usage: direct?.usage || null
        };
      }
      this.logAiMetric('proxy_http_error', {
        roomId,
        chamadoId: chamadoId ? String(chamadoId) : '',
        chatState: roomState,
        apiUrl,
        httpStatus: response.status,
        latencyMs: Date.now() - startedAt
      });
      throw new Error(`AI API status ${response.status}`);
    }

    const data = await response.json().catch(() => ({}));
    const rawReply = data?.reply ?? data?.message ?? data?.answer ?? data?.data?.reply ?? '';
    const reply = this.sanitizeAiReply(rawReply);
    this.logAiMetric('proxy_success', {
      roomId,
      chamadoId: chamadoId ? String(chamadoId) : '',
      chatState: roomState,
      apiUrl,
      latencyMs: Date.now() - startedAt,
      inputChars: String(content || '').length,
      outputChars: reply.length,
      kbHits: contextDocs.length,
      kbDocIds: contextDocs.map((doc) => doc.id),
      usage: data?.usage || null
    });
    return {
      reply,
      kbHits: contextDocs.length,
      kbDocIds: contextDocs.map((doc) => doc.id),
      kbLinks: contextDocs
        .filter((doc) => this.isValidKbUrl(doc?.url))
        .map((doc) => ({ id: String(doc.id || ''), title: String(doc.title || ''), url: String(doc.url || '') })),
      usage: data?.usage || null
    };
  }

  appendHumanHandoffOffer(text) {
    const safe = String(text || '').trim();
    if (!safe) return '';
    if (/(atendente|humano)/i.test(safe)) return safe;
    const shouldOffer = /(nao encontrei|não encontrei|nao localizei|não localizei|nao sei|não sei|preciso de mais|sem base|sem contexto|tutorial)/i.test(safe);
    if (!shouldOffer) return safe;
    return `${safe}\n\nSe quiser, eu te encaminho para um atendente humano aqui no chat.`;
  }

  async tryFastReply({ roomId, userMessage }) {
    const input = String(userMessage || '').trim();
    if (!input) return null;

    const intent = this.inferMemoryIntent(input);
    const topicLabel = this.detectTopicLabel(input);
    const hit = await fastReplyService.findBestReply({
      message: input,
      intent,
      topicLabel
    });
    if (!hit || !String(hit.reply || '').trim()) return null;

    return {
      reply: String(hit.reply || '').trim(),
      score: Number(hit.score || 0),
      matchedQuestion: String(hit.matchedQuestion || ''),
      matchedAt: hit.matchedAt || null,
      feedbackValue: hit.feedbackValue || null
    };
  }

  async publishSseMessage(roomId, payload) {
    const clients = this.getRoomClients(roomId);
    clients.forEach((client) => {
      client.write(`data: ${JSON.stringify({
        type: 'new_message',
        message: payload
      })}\n\n`);
    });
  }

  publishAiProcessing(roomId, active) {
    const clients = this.getRoomClients(roomId);
    const aiUserId = this.getAiUserId();
    const aiUserName = this.getAiUserName();
    const isTyping = Boolean(active);
    clients.forEach((client) => {
      client.write(`data: ${JSON.stringify({
        type: 'ai_processing',
        roomId,
        active: isTyping,
        aiUserId,
        aiUserName
      })}\n\n`);
      client.write(`data: ${JSON.stringify({
        type: 'typing_status',
        roomId,
        userId: aiUserId,
        userName: aiUserName,
        isTyping,
        activity: isTyping ? 'typing' : 'idle'
      })}\n\n`);
    });
  }

  normalizeActions(actions) {
    if (!Array.isArray(actions)) return [];
    return actions
      .map((item) => ({
        id: String(item?.id || ''),
        label: String(item?.label || ''),
        type: String(item?.type || 'open_url'),
        value: String(item?.value || ''),
        url: String(item?.url || ''),
        target: String(item?.target || '_blank')
      }))
      .filter((item) => item.id && item.label);
  }

  buildBrokerTextPreview(text, max = 220) {
    const safe = String(text || '').replace(/\s+/g, ' ').trim();
    if (!safe) return '';
    return safe.length > max ? `${safe.slice(0, Math.max(1, max - 3)).trim()}...` : safe;
  }

  async sendAiMessage({ roomId, content, actions = [], trace = null }) {
    const aiUser = await this.ensureAiUser();
    const room = await ChatRoom.findById(roomId);
    const previous = await Message.findByRoomId(roomId, 120);
    const hadAiBefore = Array.isArray(previous)
      && previous.some((item) => String(item?.user_id || '') === String(aiUser.id || ''));
    const normalizedActions = this.normalizeActions(actions);
    const aiMessage = await Message.create({
      roomId,
      userId: aiUser.id,
      content,
      type: 'text',
      actions: normalizedActions
    });
    fastReplyService.invalidate();

    await this.publishSseMessage(roomId, {
      id: aiMessage.id,
      room_id: roomId,
      user_id: aiUser.id,
      content,
      type: 'text',
      file_url: null,
      file_type: null,
      created_at: new Date().toISOString(),
      is_read: 0,
      name: this.getAiUserName(),
      avatar: this.getAiUserAvatar(),
      sender_role: 'system',
      is_ai: true,
      feedback_value: null,
      feedback_at: null,
      feedback_by: null,
      reaction_emoji: null,
      reaction_at: null,
      reaction_by: null,
      actions: aiMessage.actions || normalizedActions
    });
    this.updateMemoryFromAiMessage(roomId, content);
    eventBrokerService.publishAlias('IA_REPLIED_SUCCESS', {
      userId: String(aiUser.id || ''),
      priority: 'normal',
      payload: {
        roomId: String(roomId || ''),
        messageId: String(aiMessage?.id || ''),
        chamadoId: room?.chamado_id ? String(room.chamado_id) : '',
        roomType: String(room?.type || ''),
        roomStatus: String(room?.status || ''),
        chatState: this.normalizeChatState(room?.chat_state),
        senderRole: 'system',
        messageType: 'text',
        hasActions: normalizedActions.length > 0,
        actionsCount: normalizedActions.length,
        contentPreview: this.buildBrokerTextPreview(content),
        source: 'chat-taiksu'
      }
    }).catch(() => {});

    if (!hadAiBefore) {
      eventBrokerService.publishAlias('IA_FIRST_REPLY', {
        userId: String(aiUser.id || ''),
        priority: 'normal',
        payload: {
          roomId: String(roomId || ''),
          firstMessageId: String(aiMessage?.id || ''),
          chamadoId: room?.chamado_id ? String(room.chamado_id) : '',
          roomType: String(room?.type || ''),
          roomStatus: String(room?.status || ''),
          chatState: this.normalizeChatState(room?.chat_state),
          contentPreview: this.buildBrokerTextPreview(content),
          source: 'chat-taiksu'
        }
      }).catch(() => {});
    }

    if (trace && typeof trace === 'object') {
      await this.logLearningEvent('assistant_message_sent', {
        roomId: String(roomId || ''),
        chamadoId: String(trace.chamadoId || ''),
        userId: String(trace.userId || ''),
        aiUserId: String(aiUser.id || ''),
        aiMessageId: String(aiMessage.id || ''),
        source: String(trace.source || ''),
        userMessage: this.buildBrokerTextPreview(trace.userMessage || '', 280),
        aiReply: this.buildBrokerTextPreview(content, 320),
        quality: trace.quality || null,
        kbHits: Number(trace.kbHits || 0),
        kbLinks: Array.isArray(trace.kbLinks)
          ? trace.kbLinks.map((item) => String(item?.url || '')).filter(Boolean)
          : []
      });
    }

    return aiMessage;
  }

  async processAiFirstContactFlow({ room, roomId, chamadoId, content, req }) {
    const roomState = this.normalizeChatState(room?.chat_state);
    const trimmedContent = String(content || '').trim();
    const aiInputContent = this.expandShortUserMessage(trimmedContent, roomId);
    const askedHuman = this.isHumanRequest(content);
    const askedTutorial = this.isTutorialRequest(content);
    const askedOpenChamado = this.isOpenChamadoIntent(content);
    const alreadyInChamado = this.isChamadoRoom(room, chamadoId);
    const pending = this.getPendingDialog(roomId);

    const isTopicShift = this.isTopicShiftMessage(trimmedContent);
    if (isTopicShift) {
      const requestedTopic = this.extractRequestedTopic(trimmedContent) || this.extractTopicFromText(trimmedContent);
      this.clearPendingDialog(roomId);
      this.setRoomMemory(roomId, {
        topic: requestedTopic || '',
        intent: this.inferMemoryIntent(trimmedContent),
        preferredReplyStyle: this.detectReplyStylePreference(trimmedContent),
        summary: requestedTopic
          ? `Topico atual: ${requestedTopic}. Intencao: ${this.inferMemoryIntent(trimmedContent)}.`
          : `Intencao: ${this.inferMemoryIntent(trimmedContent)}.`,
        lastUserMessage: trimmedContent.slice(0, 260)
      });
    } else if (this.shouldTrackTopic(trimmedContent)) {
      this.setPendingDialog(roomId, {
        ...(pending || {}),
        topic: this.trimContextText(trimmedContent, 120)
      });
    }

    if (pending && this.isYesAnswer(trimmedContent)) {
      if (pending.type === 'details_or_human') {
        const topic = this.getLastKnownTopic(trimmedContent, roomId) || 'o assunto anterior';
        let aiReply = '';
        try {
          this.publishAiProcessing(roomId, true);
          const aiResult = await this.callAiApi({
            roomId,
            chamadoId,
            content: `O usuario respondeu "sim". Continue com mais detalhes sobre: ${topic}`,
            req,
            roomState: 'IA'
          });
          aiReply = String(aiResult?.reply || '').trim();
        } catch (_err) {
        } finally {
          this.publishAiProcessing(roomId, false);
        }
        if (!aiReply) {
          aiReply = `Perfeito. Vou seguir com mais detalhes sobre ${topic}.`;
        }
        await this.sendAiMessage({
          roomId,
          content: this.appendHumanHandoffOffer(this.sanitizeAiReply(aiReply))
        });
        this.clearPendingDialog(roomId);
        return;
      }
    }

    if (pending && this.isNoAnswer(trimmedContent)) {
      if (pending.type === 'details_or_human') {
        await ChatRoom.updateChatState(roomId, 'AGUARDANDO_HUMANO');
        await this.sendAiMessage({
          roomId,
          content: 'Sem problema. Vou te encaminhar para atendimento humano agora.'
        });
        this.clearPendingDialog(roomId);
        return;
      }
    }

    if (askedOpenChamado) {
      await ChatRoom.updateChatState(roomId, 'AGUARDANDO_HUMANO');
      await alertService.emit({
        type: 'human_requested',
        level: 'warning',
        roomId,
        chamadoId: chamadoId ? String(chamadoId) : '',
        chatState: 'AGUARDANDO_HUMANO',
        actorId: String(req.session?.user?.id || ''),
        actorName: String(req.session?.user?.name || ''),
        message: 'Cliente pediu ajuda fora da base. Encaminhado para humano no chat.',
        authToken: String(req.session?.ssoToken || '')
      });
      await this.sendAiMessage({
        roomId,
        content: 'Entendi. Vou te encaminhar para um atendente humano aqui no chat para continuar o suporte.'
      });
      this.clearPendingDialog(roomId);
      return;
    }

    if (askedHuman) {
      if (roomState === 'AGUARDANDO_HUMANO' || roomState === 'FILA' || roomState === 'HUMANO') {
        await this.sendAiMessage({
          roomId,
          content: 'Perfeito. Seu atendimento humano ja esta em andamento por aqui.'
        });
        return;
      }
      await ChatRoom.updateChatState(roomId, 'AGUARDANDO_HUMANO');
      await alertService.emit({
        type: 'human_requested',
        level: 'warning',
        roomId,
        chamadoId: chamadoId ? String(chamadoId) : '',
        chatState: 'AGUARDANDO_HUMANO',
        actorId: String(req.session?.user?.id || ''),
        actorName: String(req.session?.user?.name || ''),
        message: 'Cliente solicitou atendimento humano via chat',
        authToken: String(req.session?.ssoToken || '')
      });
      await this.sendAiMessage({
        roomId,
        content: 'Entendi. Vou te encaminhar para um atendente humano. Um instante, por favor.'
      });
      this.clearPendingDialog(roomId);
      return;
    }

    if (roomState === 'NEW') {
      await ChatRoom.updateChatState(roomId, 'IA');
    }

    const kbTopK = Number(process.env.KB_TOP_K || 3);
    const kbMinScore = Number(process.env.KB_MIN_SCORE || 2);
    const preContextDocs = knowledgeBase.retrieve(aiInputContent, { limit: kbTopK, minScore: kbMinScore });
    const preKbLinks = preContextDocs
      .filter((doc) => this.isValidKbUrl(doc?.url))
      .map((doc) => ({ id: String(doc.id || ''), title: String(doc.title || ''), url: String(doc.url || '') }));

    let fastReplyHit = null;
    try {
      fastReplyHit = await this.tryFastReply({ roomId, userMessage: aiInputContent });
    } catch (error) {
      console.warn('[AI_FAST_REPLY] falha ao buscar cache semantico:', error.message);
    }
    if (fastReplyHit) {
      let cachedReply = this.fixHallucinatedUserName(fastReplyHit.reply, req.session?.user?.name || '');
      const adaptedCached = this.adaptAiReplyForConversation({
        replyText: cachedReply,
        userMessage: trimmedContent,
        roomId
      });
      cachedReply = adaptedCached.replyText;
      cachedReply = this.appendKnowledgeReference(cachedReply, preKbLinks, trimmedContent);
      const finalCachedContent = this.appendHumanHandoffOffer(cachedReply);
      const cachedSent = await this.sendAiMessage({
        roomId,
        content: finalCachedContent,
        trace: {
          source: 'fast_reply',
          roomId,
          chamadoId: chamadoId ? String(chamadoId) : '',
          userId: String(req.session?.user?.id || ''),
          userMessage: trimmedContent,
          aiReply: finalCachedContent,
          quality: adaptedCached.quality || null
        }
      });
      this.logAiMetric('fast_reply_hit', {
        roomId,
        chamadoId: chamadoId ? String(chamadoId) : '',
        score: Number(fastReplyHit.score || 0),
        matchedQuestion: this.buildBrokerTextPreview(fastReplyHit.matchedQuestion || '', 140),
        matchedAt: fastReplyHit.matchedAt || null,
        feedbackValue: fastReplyHit.feedbackValue || null,
        inputChars: aiInputContent.length,
        outputChars: finalCachedContent.length
      });
      await this.logLearningEvent('ai_fast_reply', {
        roomId: String(roomId || ''),
        chamadoId: chamadoId ? String(chamadoId) : '',
        userId: String(req.session?.user?.id || ''),
        userMessage: this.buildBrokerTextPreview(trimmedContent, 280),
        aiMessageId: String(cachedSent?.id || ''),
        aiReply: this.buildBrokerTextPreview(finalCachedContent, 320),
        quality: adaptedCached.quality || null,
        score: Number(fastReplyHit.score || 0),
        matchedQuestion: this.buildBrokerTextPreview(fastReplyHit.matchedQuestion || '', 180),
        feedbackValue: fastReplyHit.feedbackValue || null
      });
      if (adaptedCached.quality?.topicMismatch || adaptedCached.quality?.likelyLoop) {
        await this.logLearningEvent('reply_quality_flag', {
          roomId: String(roomId || ''),
          chamadoId: chamadoId ? String(chamadoId) : '',
          userId: String(req.session?.user?.id || ''),
          source: 'fast_reply',
          quality: adaptedCached.quality
        });
      }
      return;
    }

    let aiReply = '';
    let aiMeta = {
      kbHits: preContextDocs.length,
      kbDocIds: preContextDocs.map((doc) => doc.id),
      kbLinks: preKbLinks
    };
    try {
      this.publishAiProcessing(roomId, true);
      const aiResult = await this.callAiApi({ roomId, chamadoId, content: aiInputContent, req, roomState: 'IA' });
      aiReply = String(aiResult?.reply || '').trim();
      aiMeta = {
        kbHits: Number(aiResult?.kbHits || 0),
        kbDocIds: Array.isArray(aiResult?.kbDocIds) ? aiResult.kbDocIds : [],
        kbLinks: Array.isArray(aiResult?.kbLinks) ? aiResult.kbLinks : []
      };
    } catch (error) {
      console.error('[AI] Falha ao consultar API_AI_URL:', error.message);
      await ChatRoom.updateChatState(roomId, 'AGUARDANDO_HUMANO');
      eventBrokerService.publishAlias('AI_MODEL_FAILURE', {
        userId: String(req.session?.user?.id || ''),
        priority: 'high',
        payload: {
          roomId: String(roomId || ''),
          chamadoId: chamadoId ? String(chamadoId) : '',
          roomType: String(room?.type || ''),
          roomStatus: String(room?.status || ''),
          chatStateBefore: this.normalizeChatState(room?.chat_state),
          chatStateAfter: 'AGUARDANDO_HUMANO',
          trigger: 'ai_api_error',
          userMessagePreview: this.buildBrokerTextPreview(aiInputContent),
          error: String(error.message || ''),
          actorName: String(req.session?.user?.name || ''),
          source: 'chat-taiksu'
        }
      }).catch(() => {});
      await alertService.emit({
        type: 'ai_model_failure_handoff',
        level: 'critical',
        roomId,
        chamadoId: chamadoId ? String(chamadoId) : '',
        chatState: 'AGUARDANDO_HUMANO',
        actorId: String(req.session?.user?.id || ''),
        actorName: String(req.session?.user?.name || ''),
        message: `Falha na IA (${error.message}). Encaminhando para humano.`,
        authToken: String(req.session?.ssoToken || '')
      });
      await this.sendAiMessage({
        roomId,
        content: 'Estou com instabilidade no atendimento automatico agora. Vou te encaminhar para um atendente humano aqui no chat.'
      });
      this.clearPendingDialog(roomId);
      return;
    } finally {
      this.publishAiProcessing(roomId, false);
    }

    if (!aiReply) {
      aiReply = 'Recebi sua mensagem. Posso te ajudar com isso agora.';
    }

    aiReply = this.fixHallucinatedUserName(aiReply, req.session?.user?.name || '');
    aiReply = this.maybeStripChamadoLink(aiReply, {
      kbHits: aiMeta.kbHits,
      askedTutorial,
      askedOpenChamado,
      askedHuman
    });
    const adaptedAiReply = this.adaptAiReplyForConversation({
      replyText: aiReply,
      userMessage: trimmedContent,
      roomId
    });
    aiReply = adaptedAiReply.replyText;
    aiReply = this.appendKnowledgeReference(aiReply, aiMeta.kbLinks, trimmedContent);
    if (this.shouldOfferChoiceFollowUp(aiReply)) {
      this.setPendingDialog(roomId, {
        ...(pending || {}),
        type: 'details_or_human',
        topic: this.getLastKnownTopic(trimmedContent, roomId)
      });
    }

    const finalContent = this.appendHumanHandoffOffer(aiReply);
    const sentMessage = await this.sendAiMessage({
      roomId,
      content: finalContent,
      trace: {
        source: 'ai_model',
        roomId,
        chamadoId: chamadoId ? String(chamadoId) : '',
        userId: String(req.session?.user?.id || ''),
        userMessage: trimmedContent,
        aiReply: finalContent,
        quality: adaptedAiReply.quality || null,
        kbHits: Number(aiMeta.kbHits || 0),
        kbLinks: Array.isArray(aiMeta.kbLinks) ? aiMeta.kbLinks : []
      }
    });
    await this.logLearningEvent('ai_model_reply', {
      roomId: String(roomId || ''),
      chamadoId: chamadoId ? String(chamadoId) : '',
      userId: String(req.session?.user?.id || ''),
      userMessage: this.buildBrokerTextPreview(trimmedContent, 280),
      aiMessageId: String(sentMessage?.id || ''),
      aiReply: this.buildBrokerTextPreview(finalContent, 320),
      quality: adaptedAiReply.quality || null,
      kbHits: Number(aiMeta.kbHits || 0),
      kbDocIds: Array.isArray(aiMeta.kbDocIds) ? aiMeta.kbDocIds : [],
      kbLinks: Array.isArray(aiMeta.kbLinks) ? aiMeta.kbLinks.map((item) => String(item?.url || '')).filter(Boolean) : []
    });
    if (adaptedAiReply.quality?.topicMismatch || adaptedAiReply.quality?.likelyLoop) {
      await this.logLearningEvent('reply_quality_flag', {
        roomId: String(roomId || ''),
        chamadoId: chamadoId ? String(chamadoId) : '',
        userId: String(req.session?.user?.id || ''),
        source: 'ai_model',
        quality: adaptedAiReply.quality
      });
    }
  }

  isClosedStatus(value) {
    const status = String(value || '').trim().toLowerCase();
    return ['concluido', 'concluído', 'closed', 'fechado', 'finalizado', 'resolved', 'resolvido'].includes(status);
  }

  isRoomOrChamadoClosed(room, req) {
    if (this.isClosedStatus(room?.status)) return true;
    if (this.isClosedStatus(room?.chamado_status)) return true;
    if (this.isClosedStatus(req?.body?.chamadoStatus)) return true;
    if (this.isClosedStatus(req?.body?.chamado_status)) return true;
    return false;
  }

  getInactivityHours() {
    const parsed = Number(process.env.CHAMADO_INACTIVITY_HOURS || 24);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 24;
  }

  async getRoomClosureState(room) {
    if (!room) return { closed: false, reason: '' };
    if (this.isClosedStatus(room.status) || this.isClosedStatus(room.chamado_status)) {
      return { closed: true, reason: 'Chat encerrado' };
    }
    if (String(room.type || '').toLowerCase() !== 'support_ticket') {
      return { closed: false, reason: '' };
    }

    const lastMessageAt = await Message.getLastMessageAt(room.id);
    const activityAt = lastMessageAt || room.updated_at || room.created_at;
    if (!activityAt) return { closed: false, reason: '' };

    const inactivityMs = this.getInactivityHours() * 60 * 60 * 1000;
    const isClosed = (Date.now() - new Date(activityAt).getTime()) >= inactivityMs;
    return isClosed
      ? { closed: true, reason: `Chat encerrado por ${this.getInactivityHours()}h de inatividade` }
      : { closed: false, reason: '' };
  }

  ensureSSEStore() {
    if (!global.sseClients) {
      global.sseClients = {};
    }
  }

  getRoomClients(roomId) {
    this.ensureSSEStore();
    return global.sseClients[roomId] || [];
  }

  sendMessage(req, res) {
    return upload.single('file')(req, res, async () => {
      try {
        let { roomId, content, type } = req.body;
        const chamadoId = req.body.chamadoId || req.body.chamado_id || null;
        const userId = req.session.user?.id;

        if (!userId) {
          return res.status(401).json({ error: 'Nao autenticado' });
        }

        // Suporte a fluxo de chamado: cria/resolve sala automaticamente.
        if (chamadoId) {
          const result = await ChatRoom.createOrGetChamadoRoom({
            chamadoId: String(chamadoId),
            ownerId: userId,
            name: `Chamado #${chamadoId}`,
            description: `Conversa de suporte para o chamado ${chamadoId}`
          });
          roomId = result.room.id;
          await ChatRoom.addParticipant(roomId, userId);
        }

        // Compatibilidade: quando enviam chamadoId no campo roomId (numerico).
        if (roomId) {
          const existingRoom = await ChatRoom.findById(roomId);
          if (!existingRoom && /^\d+$/.test(String(roomId))) {
            const result = await ChatRoom.createOrGetChamadoRoom({
              chamadoId: String(roomId),
              ownerId: userId,
              name: `Chamado #${roomId}`,
              description: `Conversa de suporte para o chamado ${roomId}`
            });
            roomId = result.room.id;
            await ChatRoom.addParticipant(roomId, userId);
          }
        }

        if (!roomId) {
          return res.status(400).json({ error: 'roomId/chamadoId nao informado' });
        }

        const finalRoom = await ChatRoom.findById(roomId);
        if (!finalRoom) {
          return res.status(404).json({ error: 'Sala nao encontrada para envio da mensagem' });
        }

        const closureState = await this.getRoomClosureState(finalRoom);
        if (this.isRoomOrChamadoClosed(finalRoom, req) || closureState.closed) {
          eventBrokerService.publishAlias('CHAT_MESSAGE_BLOCKED_CLOSED', {
            userId,
            priority: 'normal',
            payload: {
              roomId: String(roomId || ''),
              chamadoId: chamadoId ? String(chamadoId) : (finalRoom.chamado_id ? String(finalRoom.chamado_id) : ''),
              reason: String(closureState.reason || 'Chat fechado'),
              roomType: String(finalRoom.type || ''),
              roomStatus: String(finalRoom.status || ''),
              chamadoStatus: String(finalRoom.chamado_status || ''),
              chatState: this.normalizeChatState(finalRoom.chat_state),
              messageType: String(type || 'text').toLowerCase(),
              actorName: String(req.session?.user?.name || ''),
              actorRole: String(req.session?.user?.role || ''),
              source: 'chat-taiksu'
            }
          }).catch(() => {});
          if (/inatividade/i.test(String(closureState.reason || ''))) {
            eventBrokerService.publishAlias('CHAT_CLOSED_INACTIVITY', {
              userId,
              priority: 'normal',
              payload: {
                roomId: String(roomId || ''),
                chamadoId: chamadoId ? String(chamadoId) : (finalRoom.chamado_id ? String(finalRoom.chamado_id) : ''),
                reason: String(closureState.reason || ''),
                roomType: String(finalRoom.type || ''),
                roomStatus: String(finalRoom.status || ''),
                chamadoStatus: String(finalRoom.chamado_status || ''),
                chatState: this.normalizeChatState(finalRoom.chat_state),
                actorName: String(req.session?.user?.name || ''),
                actorRole: String(req.session?.user?.role || ''),
                source: 'chat-taiksu'
              }
            }).catch(() => {});
          }
          return res.status(409).json({
            error: closureState.reason || 'Chat fechado para novas mensagens',
            code: 'chat_closed',
            roomId
          });
        }

        let fileUrl = null;
        let fileType = null;

        if (req.file) {
          fileUrl = `/uploads/${req.file.filename}`;
          fileType = req.file.mimetype;
        }

        const senderRole = String(req.session?.user?.role || '').toLowerCase();
        const senderIsHuman = this.isHumanRole(senderRole) && !this.isAiAllowedForAdmin(req.session?.user);
        if (senderIsHuman && ['NEW', 'IA', 'AGUARDANDO_HUMANO', 'FILA'].includes(this.normalizeChatState(finalRoom.chat_state))) {
          await ChatRoom.updateChatState(roomId, 'HUMANO');
          await ChatRoom.setAssignedAgent(roomId, userId);
          finalRoom.chat_state = 'HUMANO';
          finalRoom.assigned_agent_id = userId;
        }

        const message = await Message.create({
          roomId,
          userId,
          content: content || '',
          type: type || 'text',
          fileUrl,
          fileType
        });
        if (String(type || 'text').toLowerCase() === 'text') {
          this.updateMemoryFromUserMessage(roomId, content || '');
          const userTopic = this.extractRequestedTopic(content || '') || this.extractTopicFromText(content || '');
          await this.logLearningEvent('user_message_received', {
            roomId: String(roomId || ''),
            chamadoId: chamadoId ? String(chamadoId) : (finalRoom?.chamado_id ? String(finalRoom.chamado_id) : ''),
            userId: String(userId || ''),
            messageId: String(message?.id || ''),
            chatState: this.normalizeChatState(finalRoom?.chat_state),
            message: this.buildBrokerTextPreview(content || '', 320),
            intent: this.inferMemoryIntent(content || ''),
            topicLabel: this.detectTopicLabel(userTopic || content || ''),
            topic: this.buildBrokerTextPreview(userTopic || '', 180),
            preferredReplyStyle: this.detectReplyStylePreference(content || ''),
            topicShiftSignal: this.isTopicShiftMessage(content || '')
          });
        }

        const clients = this.getRoomClients(roomId);
        const sseMessage = {
          id: message.id,
          room_id: roomId,
          user_id: userId,
          content: content || '',
          type: type || 'text',
          file_url: fileUrl,
          file_type: fileType,
          created_at: new Date().toISOString(),
          is_read: 0,
          name: req.session.user.name,
          avatar: req.session.user.avatar,
          sender_role: req.session.user.role || 'user',
          is_ai: false,
          feedback_value: null,
          feedback_at: null,
          feedback_by: null,
          reaction_emoji: null,
          reaction_at: null,
          reaction_by: null,
          actions: Array.isArray(message.actions) ? message.actions : []
        };

        clients.forEach(client => {
          client.write(`data: ${JSON.stringify({
            type: 'new_message',
            message: sseMessage
          })}\n\n`);
        });

        if (this.shouldRunAiFlow({ room: finalRoom, req, messageType: type || 'text', content })) {
          this.processAiFirstContactFlow({ room: finalRoom, roomId, chamadoId, content, req })
            .catch((aiError) => {
              console.error('[AI] Erro no fluxo IA primeiro contato:', aiError.message);
            });
        } else if (this.shouldRunAiAudioFlow({ room: finalRoom, req, messageType: type || 'text' })) {
          const audioPath = req.file ? this.resolveUploadPathFromUrl(fileUrl) : '';
          const audioMime = String(fileType || '').trim();
          const audioName = req.file?.filename || path.basename(String(fileUrl || '').split('?')[0] || '');
          if (audioPath && fs.existsSync(audioPath)) {
            this.requestExternalTranscription({
              filePath: audioPath,
              fileType: audioMime,
              fileName: audioName,
              model: this.getTranscriptionSettings().model
            })
              .then(async (result) => {
                const transcript = String(result?.text || '').trim();
                if (!transcript) {
                  await this.sendAiMessage({
                    roomId,
                    content: 'Recebi seu audio, mas nao consegui transcrever. Pode me enviar em texto ou pedir atendimento humano.'
                  });
                  return;
                }
                const enriched = `Mensagem de audio transcrita do cliente: ${transcript}`;
                this.updateMemoryFromUserMessage(roomId, transcript);
                await this.logLearningEvent('user_message_received', {
                  roomId: String(roomId || ''),
                  chamadoId: chamadoId ? String(chamadoId) : (finalRoom?.chamado_id ? String(finalRoom.chamado_id) : ''),
                  userId: String(userId || ''),
                  messageId: String(message?.id || ''),
                  chatState: this.normalizeChatState(finalRoom?.chat_state),
                  message: this.buildBrokerTextPreview(transcript, 320),
                  intent: this.inferMemoryIntent(transcript),
                  topicLabel: this.detectTopicLabel(transcript),
                  topic: this.buildBrokerTextPreview(this.extractTopicFromText(transcript), 180),
                  preferredReplyStyle: this.detectReplyStylePreference(transcript),
                  topicShiftSignal: this.isTopicShiftMessage(transcript),
                  source: 'audio_transcription'
                });
                await this.processAiFirstContactFlow({
                  room: finalRoom,
                  roomId,
                  chamadoId,
                  content: enriched,
                  req
                });
              })
              .catch(async (error) => {
                console.error('[AI] Falha ao transcrever audio:', error.message);
                await this.sendAiMessage({
                  roomId,
                  content: 'Recebi seu audio, mas a transcricao falhou no momento. Pode me enviar em texto ou pedir atendimento humano.'
                });
              });
          }
        } else if (this.shouldNotifyUnsupportedMedia({ room: finalRoom, req, messageType: type || 'text' })) {
          const actions = this.buildChamadoActions({
            roomId,
            isChamadoRoom: this.isChamadoRoom(finalRoom, chamadoId)
          });
          this.sendAiMessage({
            roomId,
            content: 'No momento, eu ainda nao consigo analisar imagens, audios ou documentos automaticamente. Se voce descrever em texto eu posso ajudar melhor, ou posso te encaminhar para atendimento humano aqui no chat.',
            actions
          }).catch((aiError) => {
            console.error('[AI] Erro ao enviar aviso de midia nao suportada:', aiError.message);
          });
        }

        res.json({ success: true, message, roomId });
      } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: error.message });
      }
    });
  }

  async markAsRead(req, res) {
    try {
      const userId = req.session.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Nao autenticado' });
      }

      const { messageId, roomId: bodyRoomId } = req.body || {};
      const roomId = req.params.roomId || bodyRoomId;

      if (roomId) {
        const result = await Message.markRoomAsRead(roomId, userId);
        if (result.count > 0) {
          const clients = this.getRoomClients(roomId);
          const payload = {
            type: 'messages_read',
            roomId,
            messageIds: result.messageIds,
            readerId: userId,
            readerName: req.session.user?.name || 'Usuario',
            readAt: new Date().toISOString()
          };
          clients.forEach((client) => {
            client.write(`data: ${JSON.stringify(payload)}\n\n`);
          });
        }
        return res.json({ success: true, roomId, updated: result.count, messageIds: result.messageIds });
      }

      if (!messageId) {
        return res.status(400).json({ error: 'messageId ou roomId obrigatorio' });
      }

      await Message.markAsRead(messageId);
      return res.json({ success: true, messageId });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async submitFeedback(req, res) {
    try {
      const userId = req.session.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Nao autenticado' });
      }

      const { messageId } = req.params;
      const value = String(req.body?.value || '').trim().toLowerCase();
      if (!messageId) {
        return res.status(400).json({ error: 'messageId obrigatorio' });
      }
      if (!['up', 'down'].includes(value)) {
        return res.status(400).json({ error: 'value invalido', allowed: ['up', 'down'] });
      }

      const message = await Message.findById(messageId);
      if (!message) {
        return res.status(404).json({ error: 'Mensagem nao encontrada' });
      }

      await Message.setFeedback({ messageId, value, userId });
      fastReplyService.invalidate();
      await this.logLearningEvent('assistant_feedback', {
        roomId: String(message.room_id || ''),
        messageId: String(messageId),
        userId: String(userId || ''),
        feedbackValue: String(value),
        aiReply: this.buildBrokerTextPreview(message.content || '', 320)
      });
      eventBrokerService.publishAlias(value === 'up' ? 'AI_FEEDBACK_UP' : 'AI_FEEDBACK_DOWN', {
        userId,
        priority: 'normal',
        payload: {
          roomId: String(message.room_id || ''),
          messageId: String(messageId),
          messageType: String(message.type || 'text'),
          senderRole: String(message.sender_role || ''),
          feedbackValue: String(value),
          actorName: String(req.session?.user?.name || ''),
          source: 'chat-taiksu'
        }
      }).catch(() => {});

      const payload = {
        type: 'message_feedback',
        roomId: message.room_id,
        messageId,
        value,
        feedbackBy: String(userId),
        feedbackAt: new Date().toISOString()
      };
      const clients = this.getRoomClients(message.room_id);
      clients.forEach((client) => {
        client.write(`data: ${JSON.stringify(payload)}\n\n`);
      });

      return res.json({ success: true, messageId, value });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async transcribeAudio(req, res) {
    try {
      const userId = req.session.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Nao autenticado' });
      }

      const messageId = String(req.params?.messageId || '').trim();
      if (!messageId) {
        return res.status(400).json({ error: 'messageId obrigatorio' });
      }

      const message = await Message.findById(messageId);
      if (!message) {
        return res.status(404).json({ error: 'Mensagem nao encontrada' });
      }

      if (String(message.type || '').toLowerCase() !== 'audio') {
        return res.status(400).json({ error: 'Apenas mensagens de audio podem ser transcritas' });
      }

      const transcriptionCfg = this.getTranscriptionSettings();
      if (!transcriptionCfg.enabled) {
        return res.status(403).json({
          error: 'Transcricao de audio desativada pelo administrador.'
        });
      }

      const cacheKey = this.getTranscriptionCacheKey(messageId, transcriptionCfg.provider, transcriptionCfg.model);
      const cached = this.transcriptionCache.get(cacheKey);
      const cachedText = this.sanitizeTranscriptionText(cached?.text || '');
      if (cached && cachedText && !this.looksLikeHtmlPayload(cachedText)) {
        return res.json({
          success: true,
          messageId,
          provider: transcriptionCfg.provider,
          model: transcriptionCfg.model,
          transcript: cachedText,
          cached: true
        });
      }
      if (cached && (!cachedText || this.looksLikeHtmlPayload(cachedText))) {
        this.transcriptionCache.delete(cacheKey);
      }

      const filePath = this.resolveUploadPathFromUrl(message.file_url);
      if (!filePath || !fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Arquivo de audio nao encontrado no servidor' });
      }

      const transcribed = await this.requestExternalTranscription({
        filePath,
        fileType: String(message.file_type || '').trim(),
        fileName: path.basename(String(message.file_url || '').split('?')[0] || filePath),
        model: transcriptionCfg.model
      });

      const transcript = String(transcribed.text || '').trim();
      if (!transcript) {
        return res.status(502).json({ error: 'Nao foi possivel extrair texto da transcricao' });
      }

      this.transcriptionCache.set(cacheKey, {
        text: transcript,
        at: Date.now()
      });

      return res.json({
        success: true,
        messageId,
        provider: transcriptionCfg.provider,
        model: transcriptionCfg.model,
        transcript,
        cached: false
      });
    } catch (error) {
      const status = Number(error?.status) || 502;
      return res.status(status).json({ error: error.message || 'Falha ao transcrever audio' });
    }
  }

  async submitReaction(req, res) {
    try {
      const userId = req.session.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Nao autenticado' });
      }

      const { messageId } = req.params;
      if (!messageId) {
        return res.status(400).json({ error: 'messageId obrigatorio' });
      }

      const emoji = String(req.body?.emoji || '').trim();
      if (emoji.length > 24) {
        return res.status(400).json({ error: 'emoji invalido' });
      }

      const message = await Message.findById(messageId);
      if (!message) {
        return res.status(404).json({ error: 'Mensagem nao encontrada' });
      }

      await Message.setReaction({ messageId, emoji, userId });

      const payload = {
        type: 'message_reaction',
        roomId: message.room_id,
        messageId: String(messageId),
        emoji: emoji || null,
        reactionBy: emoji ? String(userId) : null,
        reactionAt: emoji ? new Date().toISOString() : null
      };
      const clients = this.getRoomClients(message.room_id);
      clients.forEach((client) => {
        client.write(`data: ${JSON.stringify(payload)}\n\n`);
      });

      return res.json({ success: true, messageId: String(messageId), emoji: emoji || null });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async deleteMessage(req, res) {
    try {
      const { messageId } = req.params;
      const message = await Message.findById(messageId);

      if (!message) {
        return res.status(404).json({ error: 'Mensagem não encontrada' });
      }

      if (message.user_id !== req.session.user?.id) {
        return res.status(403).json({ error: 'Sem permissão' });
      }

      await Message.delete(messageId);

      // Remover arquivo físico se existir
      try {
        if (message && message.file_url) {
          const filename = path.basename(message.file_url);
          const fullPath = path.join(uploadsDir, filename);
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
          }
        }
      } catch (e) {
        console.warn('Não foi possível remover arquivo físico:', e.message);
      }

      // Notificar via SSE
      const clients = this.getRoomClients(message.room_id);
      clients.forEach(client => {
        client.write(`data: ${JSON.stringify({
          type: 'message_deleted',
          messageId
        })}\n\n`);
      });

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async getMessages(req, res) {
    try {
      const { roomId } = req.params;
      const limit = parseInt(req.query.limit) || 50;
      const before = String(req.query.before || '').trim();
      const messages = before
        ? await Message.findByRoomIdBefore(roomId, before, limit)
        : await Message.findByRoomId(roomId, limit);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async bootstrapInitialGreeting(req, res) {
    try {
      const { roomId } = req.params;
      const userId = req.session.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Nao autenticado' });
      }

      if (!this.isAiEnabled()) {
        return res.json({ success: true, created: false, reason: 'ai_disabled' });
      }

      if (!this.isAiAllowedForUser(req.session?.user)) {
        return res.json({ success: true, created: false, reason: 'ai_beta_not_allowed' });
      }

      const role = String(req.session?.user?.role || '').toLowerCase();
      if (this.isHumanRole(role) && !this.isAiAllowedForAdmin(req.session?.user)) {
        return res.json({ success: true, created: false, reason: 'human_role' });
      }

      const room = await ChatRoom.findById(roomId);
      if (!room) {
        return res.status(404).json({ error: 'Sala nao encontrada' });
      }

      const roomState = this.normalizeChatState(room.chat_state);
      if (['HUMANO', 'FECHADO'].includes(roomState)) {
        return res.json({ success: true, created: false, reason: 'room_state_blocked' });
      }

      if (this.bootstrapLocks.has(roomId)) {
        return res.json({ success: true, created: false, reason: 'bootstrap_in_progress' });
      }
      this.bootstrapLocks.add(roomId);

      const messages = await Message.findByRoomId(roomId, 1);
      if (Array.isArray(messages) && messages.length > 0) {
        this.bootstrapLocks.delete(roomId);
        return res.json({ success: true, created: false, reason: 'room_not_empty' });
      }

      if (roomState === 'NEW') {
        await ChatRoom.updateChatState(roomId, 'IA');
      }

      const isChamadoRoom = this.isChamadoRoom(room, null);
      const actions = this.buildChamadoActions({ isChamadoRoom });
      await this.sendAiMessage({
        roomId,
        content: this.getWelcomeMessage(isChamadoRoom),
        actions
      });
      this.bootstrapLocks.delete(roomId);

      return res.json({ success: true, created: true });
    } catch (error) {
      try {
        const { roomId } = req.params || {};
        if (roomId) this.bootstrapLocks.delete(roomId);
      } catch (_err) {}
      return res.status(500).json({ error: error.message });
    }
  }

  async getRoomState(req, res) {
    try {
      const { roomId } = req.params;
      const room = await ChatRoom.findById(roomId);
      if (!room) {
        return res.status(404).json({ error: 'Sala nao encontrada' });
      }
      const closureState = await this.getRoomClosureState(room);
      return res.json({
        success: true,
        roomId,
        closed: closureState.closed,
        reason: closureState.reason,
        audioTranscriptionEnabled: Boolean(this.getTranscriptionSettings().enabled)
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  sendSSE(req, res) {
    const { roomId } = req.params;
    this.ensureSSEStore();

    if (!global.sseClients[roomId]) {
      global.sseClients[roomId] = [];
    }

    // Headers para SSE (CORS com credenciais exige origem explicita, nunca '*')
    const origin = String(req.headers?.origin || '').trim();
    const headers = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    };
    if (origin) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Credentials'] = 'true';
      headers.Vary = 'Origin';
    }
    res.writeHead(200, headers);

    res.write(':heartbeat\n\n');
    global.sseClients[roomId].push(res);

    req.on('close', () => {
      const roomClients = global.sseClients?.[roomId];
      if (!Array.isArray(roomClients)) return;

      global.sseClients[roomId] = roomClients.filter((client) => client !== res);
      if (!global.sseClients[roomId].length) {
        delete global.sseClients[roomId];
      }
    });
  }

  setTypingStatus(req, res) {
    try {
      const { roomId } = req.params;
      const { isTyping } = req.body;
      const activity = String(req.body?.activity || '').trim().toLowerCase();
      const userId = req.session.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Nao autenticado' });
      }

      ChatRoom.findById(roomId)
        .then((room) => this.getRoomClosureState(room))
        .then((closureState) => {
          if (closureState.closed) {
            return res.status(409).json({
              error: closureState.reason || 'Chat fechado para novas mensagens',
              code: 'chat_closed',
              roomId
            });
          }

          const clients = this.getRoomClients(roomId);
          clients.forEach(client => {
            client.write(`data: ${JSON.stringify({
              type: 'typing_status',
              userId,
              isTyping,
              activity: ['typing', 'recording'].includes(activity) ? activity : (isTyping ? 'typing' : 'idle'),
              userName: req.session.user.name
            })}

`);
          });

          return res.json({ success: true });
        })
        .catch((error) => res.status(500).json({ error: error.message }));
      return;
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new MessageController();
