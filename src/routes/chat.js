const express = require('express');
const ChatController = require('../controllers/ChatController');

const router = express.Router();

// Middleware de autenticação
const authMiddleware = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/auth/login');
  }
  next();
};

// Rotas de chat
router.get('/rooms', authMiddleware, ChatController.listRooms.bind(ChatController));
router.get('/chamados', authMiddleware, ChatController.listChamadoRooms.bind(ChatController));
router.get('/room/:roomId', authMiddleware, ChatController.openRoom.bind(ChatController));
router.post('/create-room', authMiddleware, ChatController.createRoom.bind(ChatController));

module.exports = router;
