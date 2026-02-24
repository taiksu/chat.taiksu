const express = require('express');
const ChatController = require('../controllers/ChatController');

const router = express.Router();

const authApiMiddleware = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Não autenticado' });
  }
  next();
};

router.get('/chamados/rooms', authApiMiddleware, ChatController.listChamadoRoomsApi.bind(ChatController));
router.post('/chamados/:chamadoId/room', authApiMiddleware, ChatController.createOrGetChamadoRoom.bind(ChatController));

module.exports = router;
