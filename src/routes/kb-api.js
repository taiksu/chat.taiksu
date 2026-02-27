const express = require('express');
const KnowledgeBaseController = require('../controllers/KnowledgeBaseController');
const { requireApiAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.get('/draft', requireApiAuth, KnowledgeBaseController.listDraft.bind(KnowledgeBaseController));
router.get('/live', requireApiAuth, KnowledgeBaseController.listLive.bind(KnowledgeBaseController));
router.post(
  '/import-md',
  requireApiAuth,
  KnowledgeBaseController.upload.single('file'),
  KnowledgeBaseController.importMarkdown.bind(KnowledgeBaseController)
);
router.post(
  '/import-file',
  requireApiAuth,
  KnowledgeBaseController.upload.single('file'),
  KnowledgeBaseController.importMarkdown.bind(KnowledgeBaseController)
);
router.get('/import-history', requireApiAuth, KnowledgeBaseController.listImportHistory.bind(KnowledgeBaseController));
router.get('/versions', requireApiAuth, KnowledgeBaseController.listVersions.bind(KnowledgeBaseController));
router.post('/restore-version', requireApiAuth, KnowledgeBaseController.restoreVersion.bind(KnowledgeBaseController));
router.post('/clone-live-to-draft', requireApiAuth, KnowledgeBaseController.cloneLiveToDraft.bind(KnowledgeBaseController));
router.patch('/draft/:id', requireApiAuth, KnowledgeBaseController.updateDraftItem.bind(KnowledgeBaseController));
router.delete('/draft/:id', requireApiAuth, KnowledgeBaseController.deleteDraftItem.bind(KnowledgeBaseController));
router.delete('/draft', requireApiAuth, KnowledgeBaseController.clearDraft.bind(KnowledgeBaseController));
router.post('/publish', requireApiAuth, KnowledgeBaseController.publishDraft.bind(KnowledgeBaseController));

module.exports = router;
