const ChatRoom = require('../models/ChatRoom');
const Message = require('../models/Message');
const User = require('../models/User');
const ChatQueue = require('../models/ChatQueue');
const alertService = require('../services/alertService');
const eventBrokerService = require('../services/eventBrokerService');
const path = require('path');
const fs = require('fs');

class ChatController {
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

  normalizeAttendanceState(value) {
    const state = String(value || '').trim().toLowerCase();
    if (state === 'ocupado' || state === 'busy') return 'ocupado';
    return 'livre';
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
      payload: {
        roomId: String(roomId || ''),
        chamadoId: chamadoId ? String(chamadoId) : '',
        agentId: String(agentId || ''),
        source: 'chat-taiksu'
      }
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
        payload: {
          roomId: String(room.id || ''),
          roomName: String(room.name || ''),
          source: 'chat-taiksu'
        }
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
          payload: {
            roomId: String(result.room.id || ''),
            chamadoId: String(chamadoId || ''),
            roomName: String(result.room.name || ''),
            source: 'chat-taiksu'
          }
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

  async requestHumanForChamado(req, res) {
    try {
      const user = req.session.user;
      if (!user) {
        return res.status(401).json({ error: 'Nao autenticado' });
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
          payload: {
            roomId: String(room.id || ''),
            chamadoId: String(chamadoId || ''),
            position: Number(queueItem.position || 0),
            source: 'chat-taiksu'
          }
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
          payload: {
            roomId: String(updatedRoom.id || ''),
            chamadoId: String(chamadoId || ''),
            status: 'fechado',
            source: 'chat-taiksu'
          }
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
          payload: {
            roomId: String(roomId || ''),
            chamadoId: room.chamado_id ? String(room.chamado_id) : '',
            status: 'fechado',
            source: 'chat-taiksu'
          }
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
        payload: {
          roomId: String(roomId || ''),
          chamadoId: room.chamado_id ? String(room.chamado_id) : '',
          status: 'fechado',
          source: 'chat-taiksu'
        }
      }).catch(() => {});

      this.broadcastRoomEvent(roomId, {
        type: 'human_finished',
        roomId,
        chatState: 'FECHADO'
      });
      eventBrokerService.publishAlias('HUMAN_FINISHED', {
        userId: actor.id,
        priority: 'normal',
        payload: {
          roomId: String(roomId || ''),
          chamadoId: room.chamado_id ? String(room.chamado_id) : '',
          source: 'chat-taiksu'
        }
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
