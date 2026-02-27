const aiToolService = require('../services/aiToolService');

class AIToolsController {
  isAdmin(req) {
    return String(req.session?.user?.role || '').toLowerCase() === 'admin';
  }

  denyPage(req, res) {
    return res.status(403).render('error', {
      title: 'Acesso negado',
      message: 'Apenas administradores podem acessar Ferramentas IA',
      user: req.session.user
    });
  }

  denyApi(res) {
    return res.status(403).json({ error: 'Acesso restrito para admin' });
  }

  async page(req, res) {
    if (!this.isAdmin(req)) return this.denyPage(req, res);
    return res.render('dashboard/ai-tools', {
      title: 'Ferramentas IA - Chat Taiksu',
      user: req.session.user,
      activeNav: 'ai',
      aiTab: 'tools'
    });
  }

  async list(req, res) {
    if (!this.isAdmin(req)) return this.denyApi(res);
    const items = await aiToolService.listTools();
    return res.json({ success: true, items });
  }

  async create(req, res) {
    if (!this.isAdmin(req)) return this.denyApi(res);
    try {
      const created = await aiToolService.createTool(req.body || {}, req.session?.user?.id || '');
      return res.json({ success: true, item: created });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  async update(req, res) {
    if (!this.isAdmin(req)) return this.denyApi(res);
    try {
      const updated = await aiToolService.updateTool(req.params?.id, req.body || {});
      return res.json({ success: true, item: updated });
    } catch (error) {
      if (error.message === 'tool_not_found') return res.status(404).json({ error: 'Ferramenta nao encontrada' });
      return res.status(400).json({ error: error.message });
    }
  }

  async remove(req, res) {
    if (!this.isAdmin(req)) return this.denyApi(res);
    const removed = await aiToolService.deleteTool(req.params?.id);
    return res.json({ success: true, removed });
  }

  async listRuns(req, res) {
    if (!this.isAdmin(req)) return this.denyApi(res);
    try {
      const runs = await aiToolService.listRuns(req.params?.id, req.query?.limit || 30);
      return res.json({ success: true, items: runs });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  async test(req, res) {
    if (!this.isAdmin(req)) return this.denyApi(res);
    try {
      const tool = await aiToolService.getToolById(req.params?.id);
      if (!tool) return res.status(404).json({ error: 'Ferramenta nao encontrada' });
      if (!tool.enabled) return res.status(400).json({ error: 'Ferramenta desativada' });

      const args = req.body?.arguments && typeof req.body.arguments === 'object' ? req.body.arguments : {};
      const result = await aiToolService.runTool(tool, args, {
        actorId: req.session?.user?.id || '',
        userId: req.session?.user?.id || '',
        authToken: req.session?.ssoToken || '',
        roomId: String(req.body?.roomId || '').trim()
      });
      return res.json({ success: true, result });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  async executeBySlug(req, res) {
    try {
      const internal = String(process.env.API_AI_TOKEN || '').trim();
      const sent = String(req.headers['x-ai-token'] || '').trim();
      if (internal && sent !== internal) {
        return res.status(401).json({ error: 'Nao autorizado' });
      }
      const slug = String(req.params?.slug || '').trim();
      const tool = await aiToolService.getToolBySlug(slug);
      if (!tool) return res.status(404).json({ error: 'Ferramenta nao encontrada' });
      if (!tool.enabled) return res.status(400).json({ error: 'Ferramenta desativada' });
      const args = req.body?.arguments && typeof req.body.arguments === 'object' ? req.body.arguments : {};
      const result = await aiToolService.runTool(tool, args, {
        actorId: String(req.body?.actorId || ''),
        userId: String(req.body?.userId || ''),
        authToken: String(req.body?.authToken || ''),
        roomId: String(req.body?.roomId || '')
      });
      return res.json({ success: true, tool: { id: tool.id, slug: tool.slug, name: tool.name }, result });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }
}

module.exports = new AIToolsController();
