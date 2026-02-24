const express = require('express');
const MessageController = require('../controllers/MessageController');

const router = express.Router();

// Middleware de autenticação
const authMiddleware = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Não autenticado' });
  }
  next();
};

// Rotas de mensagens
router.post('/send', authMiddleware, MessageController.sendMessage.bind(MessageController));
router.post('/mark-read', authMiddleware, MessageController.markAsRead.bind(MessageController));
router.delete('/:messageId', authMiddleware, MessageController.deleteMessage.bind(MessageController));
router.get('/:roomId', authMiddleware, MessageController.getMessages.bind(MessageController));

// SSE e status de digitação
router.get('/stream/:roomId', authMiddleware, MessageController.sendSSE.bind(MessageController));
router.post('/typing/:roomId', authMiddleware, MessageController.setTypingStatus.bind(MessageController));

module.exports = router;
