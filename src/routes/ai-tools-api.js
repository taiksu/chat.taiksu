const express = require('express');
const { requireApiAuth } = require('../middleware/requireAuth');
const AIToolsController = require('../controllers/AIToolsController');

const router = express.Router();

router.get('/', requireApiAuth, AIToolsController.list.bind(AIToolsController));
router.post('/', requireApiAuth, AIToolsController.create.bind(AIToolsController));
router.put('/:id', requireApiAuth, AIToolsController.update.bind(AIToolsController));
router.delete('/:id', requireApiAuth, AIToolsController.remove.bind(AIToolsController));
router.get('/:id/runs', requireApiAuth, AIToolsController.listRuns.bind(AIToolsController));
router.post('/:id/test', requireApiAuth, AIToolsController.test.bind(AIToolsController));

// Execucao interna para agente/microservico com x-ai-token
router.post('/execute/:slug', AIToolsController.executeBySlug.bind(AIToolsController));

module.exports = router;
