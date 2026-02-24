const express = require('express');
const DashboardController = require('../controllers/DashboardController');
const { requireWebAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.get('/', requireWebAuth, DashboardController.index);
router.get('/metrics', requireWebAuth, DashboardController.metrics);

module.exports = router;
