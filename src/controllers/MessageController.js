const Message = require('../models/Message');
const ChatRoom = require('../models/ChatRoom');
const User = require('../models/User');
const knowledgeBase = require('../services/knowledgeBase');
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
    return Boolean(this.getAiApiUrl());
  }

  getAiUserId() {
    return String(process.env.AI_USER_ID || 'ai-assistant');
  }

  getAiUserName() {
    return String(process.env.AI_USER_NAME || 'Assistente Taiksu IA');
  }

  getAiUserAvatar() {
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
    if (isChamadoRoom) {
      return 'Olá! Eu sou a Assistente Marina da Taiksu IA. Este chat já está vinculado ao seu chamado. Posso te ajudar por aqui agora.';
    }
    return 'Olá! Eu sou a Assistente Marina da Taiksu IA. Posso te ajudar agora ou, se preferir, te encaminho para um atendente humano.';
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

  isChamadoRoom(room, chamadoId) {
    if (chamadoId) return true;
    return String(room?.type || '').toLowerCase() === 'support_ticket';
  }

  buildChamadoActions({ roomId, isChamadoRoom }) {
    if (isChamadoRoom) {
      return [
        {
          id: 'view_current_room',
          label: 'Ver chamado atual',
          type: 'open_url',
          url: this.getChatRoomUrl(roomId),
          target: '_blank'
        }
      ];
    }
    return [
      {
        id: 'open_chamado',
        label: 'Abrir chamado',
        type: 'open_url',
        url: this.getChamadoCreateUrl(),
        target: '_blank'
      }
    ];
  }

  shouldRunAiFlow({ room, req, messageType, content }) {
    if (!this.isAiEnabled()) return false;
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
    if (!this.isAiEnabled()) return false;
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
      const currentAvatar = String(aiUser.avatar || '').trim();
      const desiredAvatar = this.getAiUserAvatar();
      if (desiredAvatar && currentAvatar !== desiredAvatar) {
        await User.updateAvatar(aiUser.id, desiredAvatar);
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
    const context = (contextMessages || []).slice(-10).map((item) => ({
      role: String(item.user_id || '') === String(req.session.user?.id || '') ? 'user' : 'assistant',
      content: String(item.content || ''),
      createdAt: item.created_at
    }));
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
      contextDocs,
      options: {
        offerHumanHandoff: true,
        chamadoCreateUrl: this.getChamadoCreateUrl()
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
    const reply = String(rawReply || '').trim();
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
    return reply;
  }

  appendHumanHandoffOffer(text) {
    const safe = String(text || '').trim();
    if (!safe) return '';
    if (/(atendente|humano)/i.test(safe)) return safe;
    const shouldOffer = /(nao encontrei|não encontrei|nao localizei|não localizei|nao sei|não sei|preciso de mais|sem base|sem contexto|tutorial)/i.test(safe);
    if (!shouldOffer) return safe;
    return `${safe}\n\nSe preferir, posso te encaminhar para um atendente ou você pode abrir chamado em: ${this.getChamadoCreateUrl()}`;
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
      actions: aiMessage.actions || normalizedActions
    });
  }

  async processAiFirstContactFlow({ room, roomId, chamadoId, content, req }) {
    const roomState = this.normalizeChatState(room?.chat_state);
    const askedHuman = this.isHumanRequest(content);
    const askedTutorial = this.isTutorialRequest(content);
    const askedOpenChamado = this.isOpenChamadoIntent(content);
    const alreadyInChamado = this.isChamadoRoom(room, chamadoId);

    if (askedTutorial || askedOpenChamado) {
      const actions = this.buildChamadoActions({ roomId, isChamadoRoom: alreadyInChamado });
      const reply = alreadyInChamado
        ? 'Este chat já está vinculado a um chamado. Pode continuar por aqui e, se quiser, abrir a visualização completa no botão abaixo.'
        : `Para abrir um chamado, acesse o botão abaixo ou use este link oficial: ${this.getChamadoCreateUrl()}`;
      await this.sendAiMessage({ roomId, content: reply, actions });
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
      await this.sendAiMessage({
        roomId,
        content: 'Entendi. Vou te encaminhar para um atendente humano. Um instante, por favor.'
      });
      return;
    }

    if (roomState === 'NEW') {
      await ChatRoom.updateChatState(roomId, 'IA');
    }

    let aiReply = '';
    try {
      aiReply = await this.callAiApi({ roomId, chamadoId, content, req, roomState: 'IA' });
    } catch (error) {
      console.error('[AI] Falha ao consultar API_AI_URL:', error.message);
      aiReply = '';
    }

    if (!aiReply) {
      aiReply = 'Recebi sua mensagem. Posso te ajudar com isso agora.';
    }

    await this.sendAiMessage({
      roomId,
      content: this.appendHumanHandoffOffer(aiReply)
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
            content: 'No momento, eu ainda não consigo analisar imagens, áudios ou documentos automaticamente. Se você descrever em texto eu posso ajudar melhor, ou use o botão abaixo para suporte.',
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
        content: this.getWelcomeMessage(isChamadoRoom),
        actions: this.buildChamadoActions({ roomId, isChamadoRoom })
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
