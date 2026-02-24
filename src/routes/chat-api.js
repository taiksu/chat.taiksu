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
router.delete('/rooms/:roomId/messages', authApiMiddleware, ChatController.clearRoomMessages.bind(ChatController));
router.delete('/rooms/:roomId', authApiMiddleware, ChatController.deleteRoom.bind(ChatController));
router.delete('/rooms/:roomId/participants/:userId', authApiMiddleware, ChatController.removeParticipant.bind(ChatController));

module.exports = router;
