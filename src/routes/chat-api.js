const express = require('express');
const ChatController = require('../controllers/ChatController');
const { requireApiAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.get('/chamados/rooms', requireApiAuth, ChatController.listChamadoRoomsApi.bind(ChatController));
router.post('/chamados/:chamadoId/room', requireApiAuth, ChatController.createOrGetChamadoRoom.bind(ChatController));
router.delete('/rooms/:roomId/messages', requireApiAuth, ChatController.clearRoomMessages.bind(ChatController));
router.delete('/rooms/:roomId', requireApiAuth, ChatController.deleteRoom.bind(ChatController));
router.delete('/rooms/:roomId/participants/:userId', requireApiAuth, ChatController.removeParticipant.bind(ChatController));

module.exports = router;
