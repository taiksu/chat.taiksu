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
router.get('/rooms', authMiddleware, ChatController.listRooms);
router.get('/room/:roomId', authMiddleware, ChatController.openRoom);
router.post('/create-room', authMiddleware, ChatController.createRoom);

module.exports = router;
