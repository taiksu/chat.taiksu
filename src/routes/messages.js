const express = require('express');
const MessageController = require('../controllers/MessageController');
const { requireApiAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.post('/send', requireApiAuth, MessageController.sendMessage.bind(MessageController));
router.post('/mark-read', requireApiAuth, MessageController.markAsRead.bind(MessageController));
router.post('/mark-read/:roomId', requireApiAuth, MessageController.markAsRead.bind(MessageController));
router.post('/bootstrap/:roomId', requireApiAuth, MessageController.bootstrapInitialGreeting.bind(MessageController));
router.post('/:messageId/feedback', requireApiAuth, MessageController.submitFeedback.bind(MessageController));
router.delete('/:messageId', requireApiAuth, MessageController.deleteMessage.bind(MessageController));
router.get('/room-state/:roomId', requireApiAuth, MessageController.getRoomState.bind(MessageController));
router.get('/:roomId', requireApiAuth, MessageController.getMessages.bind(MessageController));

router.get('/stream/:roomId', requireApiAuth, MessageController.sendSSE.bind(MessageController));
router.post('/typing/:roomId', requireApiAuth, MessageController.setTypingStatus.bind(MessageController));

module.exports = router;
