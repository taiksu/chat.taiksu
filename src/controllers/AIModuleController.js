const settingsService = require('../services/settingsService');

class AIModuleController {
  isAdmin(req) {
    return String(req.session?.user?.role || '').toLowerCase() === 'admin';
  }

  denyPage(req, res) {
    return res.status(403).render('error', {
      title: 'Acesso negado',
      message: 'Apenas administradores podem acessar o modulo IA',
      user: req.session.user
    });
  }

  operationPage(req, res) {
    if (!this.isAdmin(req)) return this.denyPage(req, res);

    const settings = settingsService.safeForClient();
    const providerOrder = String(process.env.AI_PROVIDER_ORDER || 'ollama,gemini')
      .split(',')
      .map((item) => String(item || '').trim())
      .filter(Boolean);

    return res.render('dashboard/ai-operation', {
      title: 'IA Operacao - Chat Taiksu',
      user: req.session.user,
      activeNav: 'ai',
      aiTab: 'operation',
      info: {
        aiAttendantEnabled: Boolean(settings.aiAttendantEnabled),
        aiBetaModeEnabled: Boolean(settings.aiBetaModeEnabled),
        betaAllowlistCount: Array.isArray(settings.aiBetaAllowlist) ? settings.aiBetaAllowlist.length : 0,
        providerOrder,
        ollamaModel: String(process.env.OLLAMA_MODEL || '').trim() || 'n/a',
        geminiModel: String(process.env.GEMINI_MODEL || '').trim() || 'n/a',
        apiAiUrl: String(process.env.API_AI_URL || '').trim() || 'n/a',
        memoryTtlMinutes: Number(process.env.AI_MEMORY_TTL_MINUTES || 30)
      }
    });
  }
}

module.exports = new AIModuleController();
