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
    const providerOrder = String(process.env.AI_PROVIDER_ORDER || 'ollama')
      .split(',')
      .map((item) => String(item || '').trim())
      .filter(Boolean);

    return res.render('dashboard/ai-operation', {
      title: 'IA Operacao - Chat Taiksu',
      user: req.session.user,
      activeNav: 'ai',
      aiTab: 'operation',
      info: {
        nodeEnv: String(process.env.NODE_ENV || 'development').trim(),
        ssoEnabled: String(process.env.ENABLE_SSO ?? 'true').toLowerCase() === 'true',
        aiAttendantEnabled: Boolean(settings.aiAttendantEnabled),
        aiAllowAdminChat: Boolean(settings.aiAllowAdminChat),
        aiBetaModeEnabled: Boolean(settings.aiBetaModeEnabled),
        betaAllowlistCount: Array.isArray(settings.aiBetaAllowlist) ? settings.aiBetaAllowlist.length : 0,
        kbAutoPublishEnabled: Boolean(settings.kbAutoPublishEnabled),
        aiAgentName: String(settings.aiAgentName || 'Marina').trim() || 'Marina',
        aiTemperature: Number(settings.aiTemperature || 0.25),
        aiMaxOutputTokens: Number(settings.aiMaxOutputTokens || 280),
        aiMaxReplyChars: Number(settings.aiMaxReplyChars || 420),
        preferredProvider: String(settings.aiPreferredProvider || 'ollama').trim(),
        preferredModel: String(settings.aiPreferredModel || '').trim() || 'n/a',
        customModelsCount: Array.isArray(settings.aiCustomModels) ? settings.aiCustomModels.length : 0,
        providerOrder,
        ollamaModel: String(process.env.OLLAMA_MODEL || process.env.ollama_MODEL || '').trim() || 'n/a',
        ollamaBaseUrl: String(process.env.OLLAMA_BASE_URL || '').trim() || 'n/a',
        ollamaAuthMode: String(process.env.OLLAMA_AUTH_MODE || 'bearer').trim() || 'bearer',
        hasOllamaApiToken: Boolean(settings.hasOllamaApiToken) || Boolean(String(process.env.OLLAMA_API_TOKEN || '').trim()),
        hasApiAiToken: Boolean(String(process.env.API_AI_TOKEN || '').trim()),
        apiAiUrl: String(process.env.API_AI_URL || '').trim() || 'n/a',
        memoryTtlMinutes: Number(process.env.AI_MEMORY_TTL_MINUTES || 30),
        toolsAutoEnabled: String(process.env.AI_TOOLS_AUTO_ENABLED || 'true').trim().toLowerCase() !== 'false',
        fastReplyEnabled: String(process.env.AI_FAST_REPLY_ENABLED || 'false').trim().toLowerCase() === 'true',
        fastReplyMinScore: Number(process.env.AI_FAST_REPLY_MIN_SCORE || 0.6),
        fastReplyCacheTtlSeconds: Number(process.env.AI_FAST_REPLY_CACHE_TTL_SECONDS || 90),
        alertEmailEnabled: Boolean(settings.alertEmailEnabled),
        hasAlertEmailToken: Boolean(settings.hasAlertEmailToken),
        sessionCookieSecure: String(process.env.SESSION_COOKIE_SECURE || '').trim() === 'true',
        sessionCookieSameSite: String(process.env.SESSION_COOKIE_SAMESITE || 'lax').trim(),
        sessionCookieDomain: String(process.env.SESSION_COOKIE_DOMAIN || '').trim() || 'n/a'
      }
    });
  }
}

module.exports = new AIModuleController();
