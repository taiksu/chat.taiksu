const ChatRoom = require('../models/ChatRoom');
const Message = require('../models/Message');
const User = require('../models/User');
const ChatQueue = require('../models/ChatQueue');
const alertService = require('../services/alertService');
const eventBrokerService = require('../services/eventBrokerService');
const settingsService = require('../services/settingsService');
const SSOController = require('./SSOController');
const path = require('path');
const fs = require('fs');

class ChatController {
  async ensurePersistedSessionUser(req) {
    const sessionUser = req?.session?.user;
    if (!sessionUser?.id) return null;

    let persisted = await User.findById(sessionUser.id);
    if (!persisted && req?.session?.ssoUser) {
      try {
        persisted = await SSOController.syncSSOUser(req.session.ssoUser);
      } catch (error) {
        console.error('[chat] Falha ao sincronizar usuario SSO antes de criar sala:', error.message);
      }
    }

    if (!persisted) return null;
    req.session.user = persisted;
    return persisted;
  }

  normalizeChatState(value) {
    const state = String(value || '').trim().toUpperCase();
    const allowed = ['NEW', 'IA', 'AGUARDANDO_HUMANO', 'FILA', 'HUMANO', 'FECHADO'];
    return allowed.includes(state) ? state : null;
  }

  normalizeRoomStatus(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return null;

    const closedValues = ['fechado', 'closed', 'concluido', 'concluído', 'finalizado', 'resolved', 'resolvido'];
    const openValues = ['aberto', 'open', 'ativo', 'active', 'em_andamento', 'em andamento'];

    if (closedValues.includes(raw)) return 'fechado';
    if (openValues.includes(raw)) return 'aberto';
    return null;
  }

  isClosedStatus(value) {
    return this.normalizeRoomStatus(value) === 'fechado';
  }

  isAdmin(user) {
    return String(user?.role || '').toLowerCase() === 'admin';
  }

  isSupportAgent(user) {
    const role = String(user?.role || '').toLowerCase();
    return User.supportRoles().includes(role);
  }

  isPrivilegedSupportInboxUser(user) {
    const role = String(user?.role || '').toLowerCase();
    return ['admin', 'dev', 'developer', 'atendente', 'support', 'suporte', 'agent'].includes(role);
  }

  isBetaAllowedUser(user) {
    const settings = settingsService.load();
    if (!Boolean(settings.aiBetaModeEnabled)) return false;
    const allowlist = Array.isArray(settings.aiBetaAllowlist)
      ? settings.aiBetaAllowlist.map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean)
      : [];
    if (!allowlist.length) return false;
    const userId = String(user?.id || '').trim().toLowerCase();
    const email = String(user?.email || '').trim().toLowerCase();
    return Boolean((userId && allowlist.includes(userId)) || (email && allowlist.includes(email)));
  }

  canAccessSupportInbox(user) {
    return this.isPrivilegedSupportInboxUser(user) || this.isBetaAllowedUser(user);
  }

  normalizeAttendanceState(value) {
    const state = String(value || '').trim().toLowerCase();
    if (state === 'ocupado' || state === 'busy') return 'ocupado';
    return 'livre';
  }

  normalizeClientAppId(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    return raw
      .replace(/^https?:\/\//, '')
      .replace(/[^\w.-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 120);
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
    const closed = (Date.now() - new Date(activityAt).getTime()) >= inactivityMs;
    return closed
      ? { closed: true, reason: `Chat encerrado por ${this.getInactivityHours()}h de inatividade` }
      : { closed: false, reason: '' };
  }

  isRoomAdmin(user, room) {
    if (!user || !room) return false;
    return String(room.owner_id) === String(user.id) || this.isAdmin(user);
  }

  removePhysicalFiles(fileUrls) {
    const uploadsDir = process.env.FILES_DIR
      ? path.resolve(process.cwd(), process.env.FILES_DIR)
      : path.join(process.cwd(), 'public', 'uploads');

    for (const fileUrl of fileUrls || []) {
      if (!fileUrl) continue;
      try {
        const filename = path.basename(fileUrl);
        const fullPath = path.join(uploadsDir, filename);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      } catch (error) {
        console.warn('Falha ao remover arquivo fisico:', error.message);
      }
    }
  }

  broadcastRoomEvent(roomId, payload) {
    const clients = global.sseClients?.[roomId] || [];
    clients.forEach((client) => {
      client.write(`data: ${JSON.stringify(payload)}\n\n`);
    });
  }

  buildBrokerPayload({ room = null, roomId = '', chamadoId = '', actor = null, extra = {} } = {}) {
    return {
      roomId: String(roomId || room?.id || ''),
      chamadoId: String(chamadoId || room?.chamado_id || ''),
      roomType: String(room?.type || ''),
      roomStatus: String(room?.status || ''),
      chatState: this.normalizeChatState(room?.chat_state) || '',
      assignedAgentId: room?.assigned_agent_id ? String(room.assigned_agent_id) : '',
      actorId: actor?.id ? String(actor.id) : '',
      actorName: actor?.name ? String(actor.name) : '',
      actorRole: actor?.role ? String(actor.role) : '',
      source: 'chat-taiksu',
      ...extra
    };
  }

  async enrichRooms(rooms) {
    return Promise.all((rooms || []).map(async (room) => {
      const participants = await ChatRoom.getParticipants(room.id);
      const unreadCount = await Message.countUnread(room.id);
      return {
        ...room,
        participantsCount: participants.length,
        unreadCount
      };
    }));
  }

  summarizeMessagePreview(message) {
    if (!message) return 'Sem mensagens ainda';
    const type = String(message.type || 'text').toLowerCase();
    if (type === 'image') return '[Imagem]';
    if (type === 'audio') return '[Audio]';
    if (type === 'video') return '[Video]';
    if (type === 'document' || type === 'file') return '[Documento]';
    const text = String(message.content || '').replace(/\s+/g, ' ').trim();
    if (!text) return 'Nova mensagem';
    return text.length > 72 ? `${text.slice(0, 69).trim()}...` : text;
  }

  async buildSupportInboxRooms({ currentRoomId = '', actor = null } = {}) {
    const isPrivileged = this.isPrivilegedSupportInboxUser(actor);
    const actorId = String(actor?.id || '').trim();

    let normalRooms = [];
    let chamadoRooms = [];
    if (isPrivileged) {
      [normalRooms, chamadoRooms] = await Promise.all([
        ChatRoom.findAll(),
        ChatRoom.findChamadoRooms()
      ]);
    } else {
      const ownChamados = await ChatRoom.findChamadoRooms();
      chamadoRooms = ownChamados.filter((room) => String(room?.owner_id || '') === actorId);
    }

    const merged = new Map();
    [...(normalRooms || []), ...(chamadoRooms || [])].forEach((room) => {
      const id = String(room?.id || '');
      if (!id) return;
      merged.set(id, room);
    });

    const ownerIds = Array.from(
      new Set(
        Array.from(merged.values())
          .map((room) => String(room?.owner_id || '').trim())
          .filter(Boolean)
      )
    );
    const owners = ownerIds.length ? await User.findByIds(ownerIds) : [];
    const ownerAvatarById = new Map(
      (owners || []).map((user) => [String(user?.id || ''), String(user?.avatar || '')])
    );

    const items = await Promise.all(Array.from(merged.values()).map(async (room) => {
      const [messages, unreadCount] = await Promise.all([
        Message.findByRoomId(room.id, 1),
        Message.countUnread(room.id)
      ]);
      const lastMessage = Array.isArray(messages) && messages.length ? messages[messages.length - 1] : null;
      const updatedAt = lastMessage?.created_at || room.updated_at || room.created_at || null;
      const ownerAvatar = ownerAvatarById.get(String(room?.owner_id || '')) || '';
      return {
        id: String(room.id || ''),
        name: String(room.name || 'Sala'),
        avatar: ownerAvatar,
        unreadCount: Number(unreadCount || 0),
        lastMessagePreview: this.summarizeMessagePreview(lastMessage),
        updatedAt,
        active: String(room.id || '') === String(currentRoomId || '')
      };
    }));

    return items
      .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
      .slice(0, 120);
  }

  async assignAgentToRoom(roomId, agentId, chamadoId = '') {
    await ChatRoom.addParticipant(roomId, agentId);
    await ChatRoom.updateStatus(roomId, 'aberto');
    await ChatRoom.updateChatState(roomId, 'HUMANO');
    await ChatRoom.setAssignedAgent(roomId, agentId);
    await User.updateAttendanceState(agentId, 'ocupado');
    await ChatQueue.cancelWaitingByRoom(roomId);

    this.broadcastRoomEvent(roomId, {
      type: 'human_assigned',
      roomId,
      chamadoId: chamadoId ? String(chamadoId) : null,
      agentId: String(agentId),
      chatState: 'HUMANO'
    });
    eventBrokerService.publishAlias('HUMAN_ASSIGNED', {
      userId: agentId,
      priority: 'normal',
      payload: this.buildBrokerPayload({
        roomId,
        chamadoId,
        actor: { id: agentId, role: 'agent' },
        extra: {
          agentId: String(agentId || ''),
          assignmentMode: 'direct'
        }
      })
    }).catch(() => {});
  }

  async dispatchNextWaitingForAgent(agentId) {
    if (!agentId) return null;
    const next = await ChatQueue.getNextWaiting();
    if (!next) {
      await User.updateAttendanceState(agentId, 'livre');
      return null;
    }

    await this.assignAgentToRoom(next.room_id, agentId);
    await ChatQueue.markAssigned(next.id, agentId);
    return next;
  }

  async listRooms(req, res) {
    try {
      const rooms = await ChatRoom.findAll();
      const enrichedRooms = await this.enrichRooms(rooms);

      res.render('chat/rooms', {
        title: 'Salas de Chat - Chat Taiksu',
        rooms: enrichedRooms,
        user: req.session.user
      });
    } catch (error) {
      console.error('Error listing rooms:', error);
      res.status(500).render('error', {
        title: 'Erro',
        message: 'Erro ao listar salas',
        user: req.session.user
      });
    }
  }

  async listChamadoRooms(req, res) {
    try {
      const rooms = await ChatRoom.findChamadoRooms();
      const enrichedRooms = await this.enrichRooms(rooms);

      res.render('chat/chamados', {
        title: 'Chats por Chamado - Chat Taiksu',
        rooms: enrichedRooms,
        user: req.session.user
      });
    } catch (error) {
      console.error('Error listing chamado rooms:', error);
      res.status(500).render('error', {
        title: 'Erro',
        message: 'Erro ao listar chats por chamado',
        user: req.session.user
      });
    }
  }

  async listChamadoRoomsApi(req, res) {
    try {
      const rooms = await ChatRoom.findChamadoRooms();
      const enrichedRooms = await this.enrichRooms(rooms);
      res.json({ success: true, rooms: enrichedRooms });
    } catch (error) {
      console.error('Error listing chamado rooms api:', error);
      res.status(500).json({ error: error.message });
    }
  }

  async listSupportInboxApi(req, res) {
    try {
      const actor = req.session.user;
      if (!actor) {
        return res.status(401).json({ error: 'Nao autenticado' });
      }
      if (!this.canAccessSupportInbox(actor)) {
        return res.status(403).json({ error: 'Acesso restrito para esta conta' });
      }

      const currentRoomId = String(req.query?.roomId || '').trim();
      const rooms = await this.buildSupportInboxRooms({ currentRoomId, actor });
      return res.json({
        success: true,
        scope: this.isPrivilegedSupportInboxUser(actor) ? 'support' : 'self',
        rooms
      });
    } catch (error) {
      console.error('Error listing support inbox rooms api:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  async openRoom(req, res) {
    try {
      const { roomId } = req.params;
      const room = await ChatRoom.findById(roomId);

      if (!room) {
        return res.status(404).render('error', {
          title: 'Erro',
          message: 'Sala não encontrada',
          user: req.session.user
        });
      }

      if (req.session.user) {
        const isParticipant = await ChatRoom.hasActiveParticipant(roomId, req.session.user.id);
        if (!isParticipant) {
          await ChatRoom.addParticipant(roomId, req.session.user.id);
        }
      }

      const participants = await ChatRoom.getParticipants(roomId);
      const messages = await Message.findByRoomId(roomId, 100);
      const closureState = await this.getRoomClosureState(room);

      res.render('chat/room', {
        title: `${room.name} - Chat Taiksu`,
        room,
        participants,
        messages,
        user: req.session.user,
        canManageRoom: this.isRoomAdmin(req.session.user, room),
        initialRoomClosed: closureState.closed,
        roomClosedReason: closureState.reason
      });
    } catch (error) {
      console.error('Error opening room:', error);
      res.status(500).render('error', {
        title: 'Erro',
        message: 'Erro ao abrir sala',
        user: req.session.user
      });
    }
  }

  async createRoom(req, res) {
    try {
      const { name, description } = req.body;

      if (!req.session.user) {
        return res.status(401).json({ error: 'Não autenticado' });
      }

      const room = await ChatRoom.create({
        name,
        description,
        type: 'support',
        ownerId: req.session.user.id
      });

      await ChatRoom.addParticipant(room.id, req.session.user.id);
      eventBrokerService.publishAlias('ROOM_OPENED_BY_USER', {
        userId: req.session.user.id,
        priority: 'normal',
        payload: this.buildBrokerPayload({
          room,
          actor: req.session.user,
          extra: {
            roomName: String(room.name || '')
          }
        })
      }).catch(() => {});
      res.json({ success: true, room });
    } catch (error) {
      console.error('Error creating room:', error);
      res.status(500).json({ error: error.message });
    }
  }

  async createOrGetChamadoRoom(req, res) {
    try {
      if (!req.session.user) {
        return res.status(401).json({ error: 'Não autenticado' });
      }

      const { chamadoId } = req.params;
      const { chamadoTitle, description, participantIds } = req.body || {};

      if (!chamadoId) {
        return res.status(400).json({ error: 'chamadoId é obrigatório' });
      }

      const name = chamadoTitle
        ? `Chamado #${chamadoId} - ${String(chamadoTitle).slice(0, 80)}`
        : `Chamado #${chamadoId}`;

      const result = await ChatRoom.createOrGetChamadoRoom({
        chamadoId,
        ownerId: req.session.user.id,
        name,
        description: description || `Conversa de suporte para o chamado ${chamadoId}`
      });

      await ChatRoom.addParticipant(result.room.id, req.session.user.id);

      if (Array.isArray(participantIds)) {
        for (const participantId of participantIds) {
          if (participantId) {
            await ChatRoom.addParticipant(result.room.id, String(participantId));
          }
        }
      }

      if (result.created) {
        eventBrokerService.publishAlias('CHAMADO_CHAT_OPENED', {
          userId: req.session.user.id,
          priority: 'high',
          payload: this.buildBrokerPayload({
            room: result.room,
            chamadoId: String(chamadoId || ''),
            actor: req.session.user,
            extra: {
              roomName: String(result.room.name || '')
            }
          })
        }).catch(() => {});
      }

      res.json({
        success: true,
        created: result.created,
        room: result.room
      });
    } catch (error) {
      console.error('Error creating/getting chamado room:', error);
      res.status(500).json({ error: error.message });
    }
  }

  async createOrGetClientRoom(req, res) {
    try {
      const user = await this.ensurePersistedSessionUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Nao autenticado ou usuario nao sincronizado no chat' });
      }

      const requestedAppId = req.body?.clientAppId || req.body?.client_app_id || req.headers['x-client-app'] || '';
      const requestedAppName = req.body?.clientAppName || req.body?.client_app_name || '';
      const requestedExternalUserId = req.body?.externalUserId || req.body?.external_user_id || user.id;

      const clientAppId = this.normalizeClientAppId(requestedAppId);
      const clientUserId = String(requestedExternalUserId || user.id).trim().slice(0, 120);
      if (!clientUserId) {
        return res.status(400).json({ error: 'externalUserId e obrigatorio' });
      }

      const appLabel = String(requestedAppName || clientAppId || '').trim().slice(0, 80);
      const displayName = String(user.name || 'Cliente').trim().slice(0, 80);
      const result = await ChatRoom.createOrGetExternalClientRoom({
        clientAppId,
        clientUserId,
        ownerId: user.id,
        name: `Chat pessoal - ${displayName}`,
        description: appLabel
          ? `Atendimento pessoal unificado (origem: ${appLabel})`
          : 'Atendimento pessoal unificado por usuario'
      });

      await ChatRoom.addParticipant(result.room.id, user.id);

      if (result.created) {
        eventBrokerService.publishAlias('ROOM_OPENED_BY_USER', {
          userId: user.id,
          priority: 'normal',
          payload: this.buildBrokerPayload({
            room: result.room,
            actor: user,
            extra: {
              roomName: String(result.room.name || ''),
              origin: 'external_client_widget',
              clientAppId,
              clientUserId
            }
          })
        }).catch(() => {});
      }

      return res.json({
        success: true,
        created: Boolean(result.created),
        reopened: Boolean(result.reopened),
        room: result.room,
        roomId: result.room.id,
        clientAppId,
        clientUserId
      });
    } catch (error) {
      console.error('Error creating/getting client room:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  async requestHumanForChamado(req, res) {
    try {
      const user = await this.ensurePersistedSessionUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Nao autenticado ou usuario nao sincronizado no chat' });
      }

      const { chamadoId } = req.params;
      if (!chamadoId) {
        return res.status(400).json({ error: 'chamadoId e obrigatorio' });
      }

      const result = await ChatRoom.createOrGetChamadoRoom({
        chamadoId: String(chamadoId),
        ownerId: user.id,
        name: `Chamado #${chamadoId}`,
        description: `Conversa de suporte para o chamado ${chamadoId}`
      });
      const room = result.room;
      await ChatRoom.addParticipant(room.id, user.id);

      const availableAgents = await User.findAvailableAgents();
      if (availableAgents.length > 0) {
        const selectedAgent = availableAgents[0];
        await this.assignAgentToRoom(room.id, selectedAgent.id, String(chamadoId));
        await alertService.emit({
          type: 'human_assigned',
          level: 'info',
          roomId: room.id,
          chamadoId: String(chamadoId),
          chatState: 'HUMANO',
          actorId: String(user.id),
          actorName: user.name || '',
          authToken: String(req.session?.ssoToken || '')
        });

        return res.json({
          success: true,
          mode: 'human_assigned',
          chamadoId: String(chamadoId),
          roomId: room.id,
          agent: {
            id: String(selectedAgent.id),
            name: selectedAgent.name
          },
          chatState: 'HUMANO'
        });
      }

      const onlineAgents = await User.findOnlineAgents();
      if (onlineAgents.length > 0) {
        const queueItem = await ChatQueue.enqueue({
          roomId: room.id,
          userId: user.id
        });
        await ChatRoom.updateChatState(room.id, 'FILA');

        this.broadcastRoomEvent(room.id, {
          type: 'queue_joined',
          roomId: room.id,
          chamadoId: String(chamadoId),
          position: queueItem.position,
          chatState: 'FILA'
        });
        eventBrokerService.publishAlias('HUMAN_QUEUE_JOINED', {
          userId: user.id,
          priority: 'normal',
          payload: this.buildBrokerPayload({
            room,
            chamadoId: String(chamadoId || ''),
            actor: user,
            extra: {
              position: Number(queueItem.position || 0),
              queueId: String(queueItem.id || ''),
              queueStatus: String(queueItem.status || 'waiting')
            }
          })
        }).catch(() => {});
        await alertService.emit({
          type: 'human_requested',
          level: 'warning',
          roomId: room.id,
          chamadoId: String(chamadoId),
          chatState: 'FILA',
          actorId: String(user.id),
          actorName: user.name || '',
          message: `Cliente entrou na fila. Posicao ${queueItem.position}`,
          authToken: String(req.session?.ssoToken || '')
        });

        return res.json({
          success: true,
          mode: 'queued',
          chamadoId: String(chamadoId),
          roomId: room.id,
          position: queueItem.position,
          chatState: 'FILA'
        });
      }

      await ChatRoom.updateChatState(room.id, 'AGUARDANDO_HUMANO');
      await alertService.emit({
        type: 'human_requested',
        level: 'critical',
        roomId: room.id,
        chamadoId: String(chamadoId),
        chatState: 'AGUARDANDO_HUMANO',
        actorId: String(user.id),
        actorName: user.name || '',
        message: 'Sem atendentes disponiveis no momento',
        authToken: String(req.session?.ssoToken || '')
      });
      return res.json({
        success: true,
        mode: 'offline',
        chamadoId: String(chamadoId),
        roomId: room.id,
        chatState: 'AGUARDANDO_HUMANO',
        message: 'No momento nao ha atendentes disponiveis. Deseja abrir um chamado?'
      });
    } catch (error) {
      console.error('Error requesting human for chamado:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  async updateChamadoStatus(req, res) {
    try {
      if (!req.session.user) {
        return res.status(401).json({ error: 'Nao autenticado' });
      }

      const { chamadoId } = req.params;
      const requestedStatus = req.body?.status ?? req.body?.chamadoStatus ?? req.body?.chamado_status;

      if (!chamadoId) {
        return res.status(400).json({ error: 'chamadoId e obrigatorio' });
      }

      const normalizedStatus = this.normalizeRoomStatus(requestedStatus);
      if (!normalizedStatus) {
        return res.status(400).json({
          error: 'status invalido',
          allowed: ['aberto', 'fechado']
        });
      }

      const updatedRoom = await ChatRoom.updateChamadoStatus(String(chamadoId), normalizedStatus);
      if (!updatedRoom) {
        return res.status(404).json({ error: 'Sala de chamado nao encontrada' });
      }

      if (normalizedStatus === 'fechado') {
        await ChatRoom.updateChatState(updatedRoom.id, 'FECHADO');
        await ChatQueue.cancelWaitingByRoom(updatedRoom.id);
        if (updatedRoom.assigned_agent_id) {
          await this.dispatchNextWaitingForAgent(String(updatedRoom.assigned_agent_id));
          await ChatRoom.setAssignedAgent(updatedRoom.id, null);
        }
        eventBrokerService.publishAlias('CHAT_CLOSED_MANUAL', {
          userId: req.session.user.id,
          priority: 'high',
          payload: this.buildBrokerPayload({
            room: { ...updatedRoom, status: 'fechado', chat_state: 'FECHADO' },
            chamadoId: String(chamadoId || ''),
            actor: req.session.user,
            extra: {
              status: 'fechado',
              closeReason: 'manual_status_change'
            }
          })
        }).catch(() => {});
      } else {
        await ChatRoom.updateChatState(updatedRoom.id, 'NEW');
        await ChatRoom.setAssignedAgent(updatedRoom.id, null);
      }

      this.broadcastRoomEvent(updatedRoom.id, {
        type: 'room_status_changed',
        roomId: updatedRoom.id,
        chamadoId: String(chamadoId),
        status: normalizedStatus,
        closed: normalizedStatus === 'fechado',
        changedBy: String(req.session.user.id || '')
      });

      return res.json({
        success: true,
        chamadoId: String(chamadoId),
        roomId: updatedRoom.id,
        status: normalizedStatus,
        closed: normalizedStatus === 'fechado'
      });
    } catch (error) {
      console.error('Error updating chamado status:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  async updateRoomStatus(req, res) {
    try {
      const actor = req.session.user;
      if (!actor) {
        return res.status(401).json({ error: 'Nao autenticado' });
      }

      const { roomId } = req.params;
      if (!roomId) {
        return res.status(400).json({ error: 'roomId e obrigatorio' });
      }

      const room = await ChatRoom.findById(roomId);
      if (!room) {
        return res.status(404).json({ error: 'Sala nao encontrada' });
      }

      if (!this.isRoomAdmin(actor, room) && !this.isSupportAgent(actor)) {
        return res.status(403).json({ error: 'Sem permissao para atualizar status da sala' });
      }

      const requestedStatus = req.body?.status;
      const normalizedStatus = this.normalizeRoomStatus(requestedStatus);
      if (!normalizedStatus) {
        return res.status(400).json({
          error: 'status invalido',
          allowed: ['aberto', 'fechado']
        });
      }

      await ChatRoom.updateStatus(roomId, normalizedStatus);

      if (normalizedStatus === 'fechado') {
        await ChatRoom.updateChatState(roomId, 'FECHADO');
        await ChatQueue.cancelWaitingByRoom(roomId);
        if (room.assigned_agent_id) {
          await this.dispatchNextWaitingForAgent(String(room.assigned_agent_id));
          await ChatRoom.setAssignedAgent(roomId, null);
        }
        eventBrokerService.publishAlias('CHAT_CLOSED_MANUAL', {
          userId: actor.id,
          priority: 'high',
          payload: this.buildBrokerPayload({
            room: { ...room, id: roomId, status: 'fechado', chat_state: 'FECHADO' },
            actor,
            extra: {
              status: 'fechado',
              closeReason: 'manual_room_update'
            }
          })
        }).catch(() => {});
      } else {
        await ChatRoom.updateChatState(roomId, 'NEW');
        await ChatRoom.setAssignedAgent(roomId, null);
      }

      this.broadcastRoomEvent(roomId, {
        type: 'room_status_changed',
        roomId,
        status: normalizedStatus,
        closed: normalizedStatus === 'fechado',
        changedBy: String(actor.id || '')
      });

      return res.json({
        success: true,
        roomId,
        status: normalizedStatus,
        closed: normalizedStatus === 'fechado'
      });
    } catch (error) {
      console.error('Error updating room status:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  async updateRoomChatState(req, res) {
    try {
      const actor = req.session.user;
      if (!actor) {
        return res.status(401).json({ error: 'Nao autenticado' });
      }

      const { roomId } = req.params;
      if (!roomId) {
        return res.status(400).json({ error: 'roomId e obrigatorio' });
      }

      const room = await ChatRoom.findById(roomId);
      if (!room) {
        return res.status(404).json({ error: 'Sala nao encontrada' });
      }

      if (!this.isAdmin(actor) && !this.isSupportAgent(actor)) {
        return res.status(403).json({ error: 'Sem permissao para alterar chat_state' });
      }

      const requestedChatState = req.body?.chatState ?? req.body?.chat_state;
      const nextChatState = this.normalizeChatState(requestedChatState);
      if (!nextChatState) {
        return res.status(400).json({
          error: 'chat_state invalido',
          allowed: ['NEW', 'IA', 'AGUARDANDO_HUMANO', 'FILA', 'HUMANO', 'FECHADO']
        });
      }

      await ChatRoom.updateChatState(roomId, nextChatState);

      this.broadcastRoomEvent(roomId, {
        type: 'room_chat_state_changed',
        roomId,
        chatState: nextChatState,
        changedBy: String(actor.id || '')
      });

      return res.json({
        success: true,
        roomId,
        chatState: nextChatState
      });
    } catch (error) {
      console.error('Error updating room chat_state:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  async updateAgentAvailability(req, res) {
    try {
      const actor = req.session.user;
      if (!actor) {
        return res.status(401).json({ error: 'Nao autenticado' });
      }

      const targetAgentId = String(req.params.agentId || actor.id);
      const isSelf = String(actor.id) === targetAgentId;
      if (!isSelf && !this.isAdmin(actor)) {
        return res.status(403).json({ error: 'Sem permissao para atualizar outro agente' });
      }

      const nextState = this.normalizeAttendanceState(req.body?.attendanceState || req.body?.state);
      await User.updateAttendanceState(targetAgentId, nextState);

      if (nextState === 'livre') {
        await this.dispatchNextWaitingForAgent(targetAgentId);
      }

      return res.json({
        success: true,
        agentId: targetAgentId,
        attendanceState: nextState
      });
    } catch (error) {
      console.error('Error updating agent availability:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  async finishHumanChat(req, res) {
    try {
      const actor = req.session.user;
      if (!actor) {
        return res.status(401).json({ error: 'Nao autenticado' });
      }

      const { roomId } = req.params;
      const room = await ChatRoom.findById(roomId);
      if (!room) {
        return res.status(404).json({ error: 'Sala nao encontrada' });
      }
      if (!this.isSupportAgent(actor) && !this.isRoomAdmin(actor, room)) {
        return res.status(403).json({ error: 'Sem permissao para finalizar atendimento' });
      }

      await ChatRoom.updateStatus(roomId, 'fechado');
      await ChatRoom.updateChatState(roomId, 'FECHADO');
      await ChatQueue.cancelWaitingByRoom(roomId);

      const agentId = String(room.assigned_agent_id || actor.id || '');
      await ChatRoom.setAssignedAgent(roomId, null);
      if (agentId) {
        await this.dispatchNextWaitingForAgent(agentId);
      }
      eventBrokerService.publishAlias('CHAT_CLOSED_MANUAL', {
        userId: actor.id,
        priority: 'high',
        payload: this.buildBrokerPayload({
          room: { ...room, id: roomId, status: 'fechado', chat_state: 'FECHADO' },
          actor,
          extra: {
            status: 'fechado',
            closeReason: 'human_finish'
          }
        })
      }).catch(() => {});

      this.broadcastRoomEvent(roomId, {
        type: 'human_finished',
        roomId,
        chatState: 'FECHADO'
      });
      eventBrokerService.publishAlias('HUMAN_FINISHED', {
        userId: actor.id,
        priority: 'normal',
        payload: this.buildBrokerPayload({
          room: { ...room, id: roomId, status: 'fechado', chat_state: 'FECHADO' },
          actor,
          extra: {
            finishReason: 'agent_finished_chat'
          }
        })
      }).catch(() => {});

      return res.json({
        success: true,
        roomId,
        chatState: 'FECHADO'
      });
    } catch (error) {
      console.error('Error finishing human chat:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  async clearRoomMessages(req, res) {
    try {
      if (!req.session.user) {
        return res.status(401).json({ error: 'Nao autenticado' });
      }

      const { roomId } = req.params;
      const room = await ChatRoom.findById(roomId);
      if (!room) {
        return res.status(404).json({ error: 'Sala nao encontrada' });
      }

      if (!this.isRoomAdmin(req.session.user, room)) {
        return res.status(403).json({ error: 'Sem permissao para limpar esta sala' });
      }

      const attachments = await Message.findAttachmentsByRoomId(roomId);
      const removedCount = await Message.deleteByRoomId(roomId);
      this.removePhysicalFiles(attachments.map((item) => item.file_url));

      this.broadcastRoomEvent(roomId, {
        type: 'room_cleared',
        roomId,
        removedCount
      });

      return res.json({ success: true, removedCount });
    } catch (error) {
      console.error('Error clearing room messages:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  async deleteRoom(req, res) {
    try {
      if (!req.session.user) {
        return res.status(401).json({ error: 'Nao autenticado' });
      }

      const { roomId } = req.params;
      const room = await ChatRoom.findById(roomId);
      if (!room) {
        return res.status(404).json({ error: 'Sala nao encontrada' });
      }

      if (!this.isRoomAdmin(req.session.user, room)) {
        return res.status(403).json({ error: 'Sem permissao para excluir esta sala' });
      }

      const attachments = await Message.findAttachmentsByRoomId(roomId);
      const deletedRooms = await ChatRoom.deleteById(roomId);
      this.removePhysicalFiles(attachments.map((item) => item.file_url));

      this.broadcastRoomEvent(roomId, {
        type: 'room_deleted',
        roomId
      });

      if (global.sseClients?.[roomId]) {
        global.sseClients[roomId].forEach((client) => client.end());
        delete global.sseClients[roomId];
      }

      return res.json({ success: true, deletedRooms });
    } catch (error) {
      console.error('Error deleting room:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  async removeParticipant(req, res) {
    try {
      if (!req.session.user) {
        return res.status(401).json({ error: 'Nao autenticado' });
      }

      const { roomId, userId } = req.params;
      const room = await ChatRoom.findById(roomId);
      if (!room) {
        return res.status(404).json({ error: 'Sala nao encontrada' });
      }

      if (!this.isRoomAdmin(req.session.user, room)) {
        return res.status(403).json({ error: 'Sem permissao para remover participantes' });
      }

      if (String(userId) === String(room.owner_id)) {
        return res.status(400).json({ error: 'Nao e permitido remover o dono da sala' });
      }

      const removedCount = await ChatRoom.removeParticipant(roomId, userId);
      if (!removedCount) {
        return res.status(404).json({ error: 'Participante nao encontrado na sala' });
      }

      this.broadcastRoomEvent(roomId, {
        type: 'participant_removed',
        roomId,
        userId: String(userId)
      });

      return res.json({ success: true, removedCount });
    } catch (error) {
      console.error('Error removing participant:', error);
      return res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new ChatController();
