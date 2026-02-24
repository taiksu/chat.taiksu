const ChatRoom = require('../models/ChatRoom');
const Message = require('../models/Message');

class ChatController {
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
        await ChatRoom.addParticipant(roomId, req.session.user.id);
      }

      const participants = await ChatRoom.getParticipants(roomId);
      const messages = await Message.findByRoomId(roomId, 100);

      res.render('chat/room', {
        title: `${room.name} - Chat Taiksu`,
        room,
        participants,
        messages,
        user: req.session.user
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
}

module.exports = new ChatController();
