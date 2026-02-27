const express = require('express');
const DashboardController = require('../controllers/DashboardController');
const KnowledgeBaseController = require('../controllers/KnowledgeBaseController');
const { requireWebAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.get('/', requireWebAuth, DashboardController.index.bind(DashboardController));
router.get('/metrics', requireWebAuth, DashboardController.metrics.bind(DashboardController));
router.get('/qa-chat', requireWebAuth, DashboardController.qaChat.bind(DashboardController));
router.get('/template-lab', requireWebAuth, DashboardController.templateLab.bind(DashboardController));
router.get('/knowledge-base', requireWebAuth, KnowledgeBaseController.page.bind(KnowledgeBaseController));

module.exports = router;
