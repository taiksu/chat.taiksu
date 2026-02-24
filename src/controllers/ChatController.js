const ChatRoom = require('../models/ChatRoom');
const Message = require('../models/Message');
const path = require('path');
const fs = require('fs');

class ChatController {
  isRoomAdmin(user, room) {
    if (!user || !room) return false;
    return String(room.owner_id) === String(user.id) || user.role === 'admin';
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
        const isAdmin = this.isRoomAdmin(req.session.user, room);
        const isParticipant = await ChatRoom.hasActiveParticipant(roomId, req.session.user.id);

        if (!isAdmin && !isParticipant) {
          return res.status(403).render('error', {
            title: 'Acesso negado',
            message: 'Voce nao participa desta sala',
            user: req.session.user
          });
        }

        if (isAdmin && !isParticipant) {
          await ChatRoom.addParticipant(roomId, req.session.user.id);
        }
      }

      const participants = await ChatRoom.getParticipants(roomId);
      const messages = await Message.findByRoomId(roomId, 100);

      res.render('chat/room', {
        title: `${room.name} - Chat Taiksu`,
        room,
        participants,
        messages,
        user: req.session.user,
        canManageRoom: this.isRoomAdmin(req.session.user, room)
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
