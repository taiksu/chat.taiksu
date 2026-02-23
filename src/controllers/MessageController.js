const Message = require('../models/Message');
const ChatRoom = require('../models/ChatRoom');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Configurar multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../public/uploads'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = uuidv4() + ext;
    cb(null, name);
  }
});

const upload = multer({ storage, limits: { fileSize: 52428800 } });

class MessageController {
  sendMessage(req, res) {
    return upload.single('file')(req, res, async () => {
      try {
        const { roomId, content, type } = req.body;
        const userId = req.session.user?.id;

        if (!userId) {
          return res.status(401).json({ error: 'Não autenticado' });
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

        // Enviar SSE para todos os clientes
        const clients = global.sseClients[roomId] || [];
        clients.forEach(client => {
          client.write(`data: ${JSON.stringify({
            type: 'new_message',
            message: {
              ...message,
              name: req.session.user.name,
              avatar: req.session.user.avatar
            }
          })}\n\n`);
        });

        res.json({ success: true, message });
      } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: error.message });
      }
    });
  }

  async markAsRead(req, res) {
    try {
      const { messageId } = req.body;
      await Message.markAsRead(messageId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
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

      // Notificar via SSE
      const clients = global.sseClients[message.room_id] || [];
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

    if (!global.sseClients) {
      global.sseClients = {};
    }

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
      global.sseClients[roomId] = global.sseClients[roomId].filter(client => client !== res);
    });
  }

  setTypingStatus(req, res) {
    try {
      const { roomId } = req.params;
      const { isTyping } = req.body;
      const userId = req.session.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Não autenticado' });
      }

      // Notificar outros usuários
      const clients = global.sseClients[roomId] || [];
      clients.forEach(client => {
        client.write(`data: ${JSON.stringify({
          type: 'typing_status',
          userId,
          isTyping,
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
