const express = require('express');
const AIController = require('../controllers/AIController');

const router = express.Router();

router.post('/first-contact', AIController.firstContact.bind(AIController));

module.exports = router;
