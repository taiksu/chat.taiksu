const multer = require('multer');
const knowledgeAdmin = require('../services/knowledgeAdminService');
const settingsService = require('../services/settingsService');
const AIController = require('./AIController');

class KnowledgeBaseController {
  constructor() {
    this.upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: Number(process.env.KB_MAX_IMPORT_FILE_SIZE || 2 * 1024 * 1024) }
    });
  }

  isAdmin(req) {
    return String(req.session?.user?.role || '').toLowerCase() === 'admin';
  }

  deny(res) {
    return res.status(403).json({ error: 'Acesso restrito para admin' });
  }

  page(req, res) {
    if (!this.isAdmin(req)) {
      return res.status(403).render('error', {
        title: 'Acesso negado',
        message: 'Apenas administradores podem acessar a Base de Conhecimento',
        user: req.session.user
      });
    }

    const draftItems = knowledgeAdmin.getDraft();
    const liveItems = knowledgeAdmin.getKnowledge();
    return res.render('dashboard/knowledgebase', {
      title: 'Base de Conhecimento IA - Chat Taiksu',
      user: req.session.user,
      draftCount: draftItems.length,
      liveCount: liveItems.length,
      activeNav: 'ai',
      aiTab: 'knowledge'
    });
  }

  importMarkdown(req, res) {
    if (!this.isAdmin(req)) return this.deny(res);
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Arquivo .md obrigatorio' });

    const markdown = String(file.buffer || Buffer.from('')).trim();
    if (!markdown) return res.status(400).json({ error: 'Arquivo sem conteudo' });

    const settings = settingsService.load();
    const autoPublish = req.body?.autoPublish !== undefined
      ? String(req.body.autoPublish).toLowerCase() === 'true'
      : Boolean(settings.kbAutoPublishEnabled);
    const mode = String(req.body?.mode || 'replace').toLowerCase() === 'append' ? 'append' : 'replace';

    const result = knowledgeAdmin.importFromMarkdown(markdown, {
      sourceName: file.originalname || 'import.md',
      author: req.session?.user?.name || 'admin',
      autoPublish,
      mode
    });

    return res.json({
      success: true,
      imported: result.imported,
      mode: result.mode,
      autoPublished: result.autoPublished,
      published: result.published,
      draftCount: result.draftCount,
      versionFile: result.versionFile
    });
  }

  listImportHistory(req, res) {
    if (!this.isAdmin(req)) return this.deny(res);
    const limit = Math.min(200, Math.max(1, Number(req.query?.limit || 30)));
    return res.json({ success: true, items: knowledgeAdmin.getImportHistory(limit) });
  }

  listDraft(req, res) {
    if (!this.isAdmin(req)) return this.deny(res);
    return res.json({ success: true, items: knowledgeAdmin.getDraft() });
  }

  listLive(req, res) {
    if (!this.isAdmin(req)) return this.deny(res);
    return res.json({ success: true, items: knowledgeAdmin.getKnowledge() });
  }

  updateDraftItem(req, res) {
    if (!this.isAdmin(req)) return this.deny(res);
    const { id } = req.params;
    const patch = req.body || {};
    const updated = knowledgeAdmin.updateDraftItem(id, patch);
    if (!updated) return res.status(404).json({ error: 'Item nao encontrado no draft' });
    return res.json({ success: true, item: updated });
  }

  bulkUpdateDraft(req, res) {
    if (!this.isAdmin(req)) return this.deny(res);
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ error: 'items obrigatorio (array)' });
    const normalized = items.map((entry) => {
      const patch = entry?.patch && typeof entry.patch === 'object' ? entry.patch : {};
      const nextPatch = { ...patch };
      if (nextPatch.tags !== undefined) {
        nextPatch.tags = Array.isArray(nextPatch.tags)
          ? nextPatch.tags.map((tag) => String(tag || '').trim()).filter(Boolean)
          : String(nextPatch.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean);
      }
      return {
        id: String(entry?.id || '').trim(),
        patch: nextPatch
      };
    }).filter((entry) => entry.id);

    if (!normalized.length) return res.status(400).json({ error: 'Nenhum item valido para atualizar' });
    const result = knowledgeAdmin.bulkUpdateDraft(normalized);
    return res.json({ success: true, updated: Number(result.updated || 0), items: result.items || [] });
  }

  deleteDraftItem(req, res) {
    if (!this.isAdmin(req)) return this.deny(res);
    const { id } = req.params;
    const result = knowledgeAdmin.deleteDraftItem(id);
    return res.json({ success: true, removed: result.removed, items: result.items });
  }

  clearDraft(req, res) {
    if (!this.isAdmin(req)) return this.deny(res);
    const items = knowledgeAdmin.clearDraft();
    return res.json({ success: true, items, draftCount: 0 });
  }

  publishDraft(req, res) {
    if (!this.isAdmin(req)) return this.deny(res);
    const result = knowledgeAdmin.publishDraft();
    if (!result.published) return res.status(400).json({ error: 'Draft vazio, nada para publicar' });
    return res.json({
      success: true,
      published: result.published,
      liveCount: Number(result.liveCount || 0),
      versionFile: result.versionFile
    });
  }

  async autoTagDraftItem(req, res) {
    if (!this.isAdmin(req)) return this.deny(res);
    const itemId = String(req.params?.id || '').trim();
    if (!itemId) return res.status(400).json({ error: 'id obrigatorio' });

    const draft = knowledgeAdmin.getDraft();
    const target = draft.find((item) => String(item?.id || '') === itemId);
    if (!target) return res.status(404).json({ error: 'Item nao encontrado no draft' });

    const text = [target.title, target.content, target.intent, target.category].filter(Boolean).join('\n');
    let tags = [];
    let source = 'heuristic';
    try {
      tags = await AIController.suggestKnowledgeTags(text);
      source = 'ai';
    } catch (_err) {
      tags = knowledgeAdmin.buildTags(text);
    }

    const updated = knowledgeAdmin.updateDraftItem(itemId, { tags: Array.isArray(tags) ? tags.slice(0, 8) : [] });
    return res.json({ success: true, source, item: updated });
  }

  async autoTagAllDraft(req, res) {
    if (!this.isAdmin(req)) return this.deny(res);
    const draft = knowledgeAdmin.getDraft();
    if (!draft.length) return res.json({ success: true, updated: 0, source: 'none' });

    let aiSuccessCount = 0;
    let fallbackCount = 0;
    const patchList = [];
    for (const item of draft) {
      const text = [item.title, item.content, item.intent, item.category].filter(Boolean).join('\n');
      let tags = [];
      try {
        tags = await AIController.suggestKnowledgeTags(text);
        aiSuccessCount += 1;
      } catch (_err) {
        tags = knowledgeAdmin.buildTags(text);
        fallbackCount += 1;
      }
      patchList.push({
        id: String(item.id || ''),
        patch: { tags: Array.isArray(tags) ? tags.slice(0, 8) : [] }
      });
    }

    const result = knowledgeAdmin.bulkUpdateDraft(patchList);
    return res.json({
      success: true,
      updated: Number(result.updated || 0),
      source: aiSuccessCount > 0 && fallbackCount === 0 ? 'ai' : (aiSuccessCount > 0 ? 'mixed' : 'heuristic'),
      aiSuccessCount,
      fallbackCount
    });
  }

  cloneLiveToDraft(req, res) {
    if (!this.isAdmin(req)) return this.deny(res);
    const result = knowledgeAdmin.cloneLiveToDraft();
    return res.json({ success: true, ...result });
  }

  listVersions(req, res) {
    if (!this.isAdmin(req)) return this.deny(res);
    const limit = Math.min(50, Math.max(1, Number(req.query?.limit || 20)));
    return res.json({ success: true, items: knowledgeAdmin.listVersions(limit) });
  }

  restoreVersion(req, res) {
    if (!this.isAdmin(req)) return this.deny(res);
    try {
      const versionFile = String(req.body?.versionFile || '').trim();
      if (!versionFile) return res.status(400).json({ error: 'versionFile obrigatorio' });
      const result = knowledgeAdmin.restoreVersion(versionFile);
      return res.json({ success: true, ...result });
    } catch (error) {
      if (error.message === 'version_file_invalid') {
        return res.status(400).json({ error: 'Arquivo de versao invalido' });
      }
      if (error.message === 'version_file_not_found') {
        return res.status(404).json({ error: 'Versao nao encontrada' });
      }
      return res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new KnowledgeBaseController();
