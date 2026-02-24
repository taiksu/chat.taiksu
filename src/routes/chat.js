const express = require('express');
const ChatController = require('../controllers/ChatController');
const { requireWebAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.get('/rooms', requireWebAuth, ChatController.listRooms.bind(ChatController));
router.get('/chamados', requireWebAuth, ChatController.listChamadoRooms.bind(ChatController));
router.get('/room/:roomId', requireWebAuth, ChatController.openRoom.bind(ChatController));
router.post('/create-room', requireWebAuth, ChatController.createRoom.bind(ChatController));

module.exports = router;
