const Message = require('../models/Message');
const ChatRoom = require('../models/ChatRoom');
const User = require('../models/User');
const knowledgeBase = require('../services/knowledgeBase');
const alertService = require('../services/alertService');
const settingsService = require('../services/settingsService');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

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
    return enabledBySettings && Boolean(this.getAiApiUrl());
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

  getAiUserId() {
    return String(process.env.AI_USER_ID || 'ai-assistant');
  }

  getAiUserName() {
    const settings = settingsService.load();
    return String(settings.aiAgentName || process.env.AI_USER_NAME || 'Marina').trim() || 'Marina';
  }

  getAiUserAvatar() {
    const settings = settingsService.load();
    const configured = String(settings.aiAgentAvatar || '').trim();
    if (configured) return configured;
    const envAvatar = String(process.env.AI_USER_AVATAR || '').trim();
    if (envAvatar) return envAvatar;
    return '/images/system.png';
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
      return `Olá! Eu sou a Assistente ${agentName} da Taiksu IA. Vamos resolver por aqui no chat. Se precisar, eu te encaminho para um atendente humano.`;
    }
    return `Olá! Eu sou a Assistente ${agentName} da Taiksu IA. Posso te ajudar agora e, se precisar, te encaminho para um atendente humano.`;
  }

  isHumanRequest(text) {
    const normalized = String(text || '').toLowerCase();
    if (!normalized) return false;
    return /(humano|atendente|pessoa|suporte humano|falar com|transferir|representante)/i.test(normalized);
  }

  isTutorialRequest(text) {
    const normalized = String(text || '').toLowerCase();
    if (!normalized) return false;
    return /(tutorial|passo a passo|guia|manual|documentacao|documentação)/i.test(normalized);
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
    const summary = topic
      ? `Topico atual: ${topic}. Intencao: ${intent}.`
      : (current.summary || `Intencao: ${intent}.`);
    this.setRoomMemory(roomId, {
      topic,
      intent,
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

    safe = this.sanitizeAiReply(safe);
    if (!safe) {
      safe = 'Recebi sua mensagem. Posso te ajudar com isso agora.';
    }
    return safe;
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

  buildChamadoActions() {
    return [];
  }

  shouldRunAiFlow({ room, req, messageType, content }) {
    if (!this.isAiAllowedForUser(req.session?.user)) return false;
    if (String(messageType || 'text').toLowerCase() !== 'text') return false;
    if (!String(content || '').trim()) return false;
    if (!room) return false;

    const roomState = this.normalizeChatState(room.chat_state);
    if (['HUMANO', 'FECHADO'].includes(roomState)) return false;

    const role = String(req.session?.user?.role || '').toLowerCase();
    if (this.isHumanRole(role)) return false;

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
    if (!room) return false;
    const roomState = this.normalizeChatState(room.chat_state);
    if (['HUMANO', 'FECHADO'].includes(roomState)) return false;

    const role = String(req.session?.user?.role || '').toLowerCase();
    const humanRoles = ['admin', 'atendente', 'agent', 'suporte', 'support'];
    if (humanRoles.includes(role)) return false;
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
        role: String(req.session.user?.role || 'user')
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

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
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
        url: String(item?.url || ''),
        target: String(item?.target || '_blank')
      }))
      .filter((item) => item.id && item.label);
  }

  async sendAiMessage({ roomId, content, actions = [] }) {
    const aiUser = await this.ensureAiUser();
    const normalizedActions = this.normalizeActions(actions);
    const aiMessage = await Message.create({
      roomId,
      userId: aiUser.id,
      content,
      type: 'text',
      actions: normalizedActions
    });

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
      actions: aiMessage.actions || normalizedActions
    });
    this.updateMemoryFromAiMessage(roomId, content);
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

    if (this.shouldTrackTopic(trimmedContent)) {
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

    if (askedTutorial || askedOpenChamado) {
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

    let aiReply = '';
    let aiMeta = { kbHits: 0, kbDocIds: [] };
    try {
      this.publishAiProcessing(roomId, true);
      const aiResult = await this.callAiApi({ roomId, chamadoId, content: aiInputContent, req, roomState: 'IA' });
      aiReply = String(aiResult?.reply || '').trim();
      aiMeta = {
        kbHits: Number(aiResult?.kbHits || 0),
        kbDocIds: Array.isArray(aiResult?.kbDocIds) ? aiResult.kbDocIds : []
      };
    } catch (error) {
      console.error('[AI] Falha ao consultar API_AI_URL:', error.message);
      await ChatRoom.updateChatState(roomId, 'AGUARDANDO_HUMANO');
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
    aiReply = this.adaptAiReplyForConversation({
      replyText: aiReply,
      userMessage: trimmedContent,
      roomId
    });
    if (this.shouldOfferChoiceFollowUp(aiReply)) {
      this.setPendingDialog(roomId, {
        ...(pending || {}),
        type: 'details_or_human',
        topic: this.getLastKnownTopic(trimmedContent, roomId)
      });
    }

    const finalContent = this.appendHumanHandoffOffer(aiReply);
    await this.sendAiMessage({
      roomId,
      content: finalContent
    });
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
        const senderIsHuman = this.isHumanRole(senderRole);
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
        } else if (this.shouldNotifyUnsupportedMedia({ room: finalRoom, req, messageType: type || 'text' })) {
          const actions = this.buildChamadoActions({
            roomId,
            isChamadoRoom: this.isChamadoRoom(finalRoom, chamadoId)
          });
          this.sendAiMessage({
            roomId,
            content: 'No momento, eu ainda não consigo analisar imagens, áudios ou documentos automaticamente. Se você descrever em texto eu posso ajudar melhor, ou posso te encaminhar para atendimento humano aqui no chat.'
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
      const messages = await Message.findByRoomId(roomId, limit);
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
      const humanRoles = ['admin', 'atendente', 'agent', 'suporte', 'support'];
      if (humanRoles.includes(role)) {
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
      await this.sendAiMessage({
        roomId,
        content: this.getWelcomeMessage(isChamadoRoom)
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
        reason: closureState.reason
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

    // Headers para SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

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
