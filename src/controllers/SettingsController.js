const settingsService = require('../services/settingsService');
const AIController = require('./AIController');

class SettingsController {
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
        message: 'Apenas administradores podem acessar configuracoes',
        user: req.session.user
      });
    }

    const aiTab = 'agent';
    return res.render('dashboard/settings', {
      title: 'Configuracoes - Chat Taiksu',
      user: req.session.user,
      settings: settingsService.safeForClient(),
      activeNav: 'ai',
      aiTab
    });
  }

  getSettings(req, res) {
    if (!this.isAdmin(req)) return this.deny(res);
    return res.json({ success: true, settings: settingsService.safeForClient() });
  }

  async listAiModels(req, res) {
    if (!this.isAdmin(req)) return this.deny(res);
    const fetchMode = String(req.headers['sec-fetch-mode'] || '').toLowerCase();
    const requestedWith = String(req.headers['x-requested-with'] || '').toLowerCase();
    if (fetchMode === 'navigate' && requestedWith !== 'xmlhttprequest') {
      return res.redirect('/dashboard/settings');
    }
    try {
      const catalog = await AIController.listAvailableModels();
      return res.json({ success: true, ...catalog });
    } catch (error) {
      return res.status(502).json({ error: error.message || 'Falha ao listar modelos de IA' });
    }
  }

  async updateSettings(req, res) {
    if (!this.isAdmin(req)) return this.deny(res);
    try {
      const body = req.body || {};
      const current = settingsService.load();
      const sessionToken = String(req.session?.ssoToken || '').trim();
      const informedToken = body.alertEmailToken !== undefined ? String(body.alertEmailToken || '').trim() : undefined;
      const tokenToSave = informedToken === undefined
        ? (String(current.alertEmailToken || '').trim() ? undefined : (sessionToken || undefined))
        : (informedToken || sessionToken || undefined);
      const informedOllamaToken = body.ollamaApiToken !== undefined ? String(body.ollamaApiToken || '').trim() : undefined;
      const ollamaTokenToSave = informedOllamaToken === undefined
        ? undefined
        : informedOllamaToken;
      const next = await settingsService.save({
        aiAttendantEnabled: body.aiAttendantEnabled,
        aiAllowAdminChat: body.aiAllowAdminChat,
        aiBetaModeEnabled: body.aiBetaModeEnabled,
        aiBetaAllowlist: body.aiBetaAllowlist,
        aiAgentName: body.aiAgentName,
        aiAgentAvatar: body.aiAgentAvatar,
        aiPersonalityPrompt: body.aiPersonalityPrompt,
        aiTemperature: body.aiTemperature,
        aiMaxOutputTokens: body.aiMaxOutputTokens,
        aiMaxReplyChars: body.aiMaxReplyChars,
        aiPreferredProvider: body.aiPreferredProvider,
        aiPreferredModel: body.aiPreferredModel,
        aiCustomModels: body.aiCustomModels,
        ollamaApiToken: ollamaTokenToSave,
        kbAutoPublishEnabled: body.kbAutoPublishEnabled,
        alertEmailEnabled: body.alertEmailEnabled,
        alertEmailApiUrl: body.alertEmailApiUrl,
        alertEmailToken: tokenToSave,
        alertEmailTo: body.alertEmailTo,
        alertEmailServiceId: body.alertEmailServiceId
      });
      return res.json({ success: true, settings: settingsService.safeForClient(), persisted: next });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Falha ao salvar configuracoes' });
    }
  }

  async testPrompt(req, res) {
    if (!this.isAdmin(req)) return this.deny(res);
    try {
      const body = req.body || {};
      const apiUrl = String(process.env.API_AI_URL || '').trim();
      const internalToken = String(process.env.API_AI_TOKEN || '').trim();
      const payload = {
        roomId: 'settings-test-prompt',
        chamadoId: null,
        chatState: 'IA',
        message: String(body.testMessage || '').trim() || 'Olá, preciso de ajuda.',
        user: {
          id: String(req.session?.user?.id || 'preview-user'),
          name: String(req.session?.user?.name || 'Usuario Teste'),
          role: 'user',
          email: String(req.session?.user?.email || '')
        },
        context: [],
        contextDocs: [],
        options: { offerHumanHandoff: true },
        overrides: {
          aiAgentName: body.aiAgentName,
          aiPersonalityPrompt: body.aiPersonalityPrompt,
          aiTemperature: body.aiTemperature,
          aiMaxOutputTokens: body.aiMaxOutputTokens,
          aiMaxReplyChars: body.aiMaxReplyChars,
          aiPreferredProvider: body.aiPreferredProvider,
          aiPreferredModel: body.aiPreferredModel
        }
      };

      let result;
      if (apiUrl) {
        const headers = { 'Content-Type': 'application/json' };
        if (internalToken) headers['x-ai-token'] = internalToken;
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data?.success === false) {
          throw new Error(data?.error || `Erro HTTP ${response.status}`);
        }
        result = {
          provider: String(data?.provider || '').trim() || 'n/a',
          model: String(data?.model || '').trim() || 'n/a',
          reply: String(data?.reply || data?.message || '').trim(),
          usage: data?.usage || null,
          latencyMs: Number(data?.latencyMs || 0) || 0
        };
      } else {
        result = await AIController.previewReply(
          {
            message: payload.message,
            userName: payload.user.name
          },
          payload.overrides
        );
      }
      return res.json({ success: true, result });
    } catch (error) {
      return res.status(502).json({ error: error.message || 'Falha ao testar prompt' });
    }
  }

  async rotateOllamaToken(req, res) {
    if (!this.isAdmin(req)) return this.deny(res);
    try {
      const rotated = await settingsService.rotateOllamaToken({
        actorId: String(req.session?.user?.id || ''),
        actorName: String(req.session?.user?.name || ''),
        source: 'settings-page',
        ip: String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || ''),
        userAgent: String(req.headers['user-agent'] || '')
      });
      return res.json({
        success: true,
        token: rotated.token,
        audit: rotated.audit,
        recent: settingsService.loadOllamaTokenAudit(10)
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Falha ao rotacionar token Ollama' });
    }
  }

  getOllamaTokenAudit(req, res) {
    if (!this.isAdmin(req)) return this.deny(res);
    const limit = Number(req.query?.limit || 10);
    return res.json({
      success: true,
      items: settingsService.loadOllamaTokenAudit(limit)
    });
  }
}

module.exports = new SettingsController();
