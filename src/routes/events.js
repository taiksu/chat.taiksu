const express = require('express');
const heartbeat = require('../cliente/heartbeat');

const router = express.Router();

router.get('/heartbeat', heartbeat);

module.exports = router;
