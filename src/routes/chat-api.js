const express = require('express');
const ChatController = require('../controllers/ChatController');
const { requireApiAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.get('/chamados/rooms', requireApiAuth, ChatController.listChamadoRoomsApi.bind(ChatController));
router.post('/client/room', requireApiAuth, ChatController.createOrGetClientRoom.bind(ChatController));
router.post('/chamados/:chamadoId/room', requireApiAuth, ChatController.createOrGetChamadoRoom.bind(ChatController));
router.post('/chamados/:chamadoId/request-human', requireApiAuth, ChatController.requestHumanForChamado.bind(ChatController));
router.patch('/chamados/:chamadoId/status', requireApiAuth, ChatController.updateChamadoStatus.bind(ChatController));
router.patch('/agents/availability', requireApiAuth, ChatController.updateAgentAvailability.bind(ChatController));
router.patch('/agents/:agentId/availability', requireApiAuth, ChatController.updateAgentAvailability.bind(ChatController));
router.post('/rooms/:roomId/finish-human', requireApiAuth, ChatController.finishHumanChat.bind(ChatController));
router.patch('/rooms/:roomId/status', requireApiAuth, ChatController.updateRoomStatus.bind(ChatController));
router.patch('/rooms/:roomId/chat-state', requireApiAuth, ChatController.updateRoomChatState.bind(ChatController));
router.delete('/rooms/:roomId/messages', requireApiAuth, ChatController.clearRoomMessages.bind(ChatController));
router.delete('/rooms/:roomId', requireApiAuth, ChatController.deleteRoom.bind(ChatController));
router.delete('/rooms/:roomId/participants/:userId', requireApiAuth, ChatController.removeParticipant.bind(ChatController));

module.exports = router;
