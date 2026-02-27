const express = require('express');
const DashboardController = require('../controllers/DashboardController');
const KnowledgeBaseController = require('../controllers/KnowledgeBaseController');
const SettingsController = require('../controllers/SettingsController');
const FeedbackInsightsController = require('../controllers/FeedbackInsightsController');
const { requireWebAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.get('/', requireWebAuth, DashboardController.index.bind(DashboardController));
router.get('/metrics', requireWebAuth, DashboardController.metrics.bind(DashboardController));
router.get('/qa-chat', requireWebAuth, DashboardController.qaChat.bind(DashboardController));
router.get('/template-lab', requireWebAuth, DashboardController.templateLab.bind(DashboardController));
router.get('/alerts/pending', requireWebAuth, DashboardController.alertsPending.bind(DashboardController));
router.get('/alerts/recent', requireWebAuth, DashboardController.alertsRecent.bind(DashboardController));
router.get('/knowledge-base', requireWebAuth, KnowledgeBaseController.page.bind(KnowledgeBaseController));
router.get('/settings', requireWebAuth, SettingsController.page.bind(SettingsController));
router.get('/feedback-insights', requireWebAuth, FeedbackInsightsController.page.bind(FeedbackInsightsController));
router.get('/feedback-insights/data', requireWebAuth, FeedbackInsightsController.data.bind(FeedbackInsightsController));
router.post('/feedback-insights/suggest/:messageId', requireWebAuth, FeedbackInsightsController.suggestToKnowledge.bind(FeedbackInsightsController));

module.exports = router;
