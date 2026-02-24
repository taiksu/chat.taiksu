const Message = require('../models/Message');
const ChatRoom = require('../models/ChatRoom');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Configurar multer
const defaultPublicDir = process.env.PUBLIC_DIR
  ? path.resolve(process.cwd(), process.env.PUBLIC_DIR)
  : path.resolve(process.cwd(), 'public_html');

const uploadsDir = process.env.FILES_DIR
  ? path.resolve(process.cwd(), process.env.FILES_DIR)
  : path.join(defaultPublicDir, 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
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

        if (this.isRoomOrChamadoClosed(finalRoom, req)) {
          return res.status(409).json({
            error: 'Chat fechado para novas mensagens',
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
          avatar: req.session.user.avatar
        };

        clients.forEach(client => {
          client.write(`data: ${JSON.stringify({
            type: 'new_message',
            message: sseMessage
          })}\n\n`);
        });

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
        return res.status(401).json({ error: 'Não autenticado' });
      }

      // Notificar outros usuários
      const clients = this.getRoomClients(roomId);
      clients.forEach(client => {
        client.write(`data: ${JSON.stringify({
          type: 'typing_status',
          userId,
          isTyping,
          activity: ['typing', 'recording'].includes(activity) ? activity : (isTyping ? 'typing' : 'idle'),
          userName: req.session.user.name
        })}\n\n`);
      });

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new MessageController();
