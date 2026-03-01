const express = require('express');
const SettingsController = require('../controllers/SettingsController');
const { requireApiAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.get('/', requireApiAuth, SettingsController.getSettings.bind(SettingsController));
router.get('/ai-models', requireApiAuth, SettingsController.listAiModels.bind(SettingsController));
router.put('/', requireApiAuth, SettingsController.updateSettings.bind(SettingsController));
router.post('/test-prompt', requireApiAuth, SettingsController.testPrompt.bind(SettingsController));

module.exports = router;
