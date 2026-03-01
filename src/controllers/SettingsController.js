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
    try {
      const catalog = await AIController.listAvailableModels();
      return res.json({ success: true, ...catalog });
    } catch (error) {
      return res.status(502).json({ error: error.message || 'Falha ao listar modelos de IA' });
    }
  }

  updateSettings(req, res) {
    if (!this.isAdmin(req)) return this.deny(res);
    const body = req.body || {};
    const current = settingsService.load();
    const sessionToken = String(req.session?.ssoToken || '').trim();
    const informedToken = body.alertEmailToken !== undefined ? String(body.alertEmailToken || '').trim() : undefined;
    const tokenToSave = informedToken === undefined
      ? (String(current.alertEmailToken || '').trim() ? undefined : (sessionToken || undefined))
      : (informedToken || sessionToken || undefined);
    const next = settingsService.save({
      aiAttendantEnabled: body.aiAttendantEnabled,
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
      kbAutoPublishEnabled: body.kbAutoPublishEnabled,
      alertEmailEnabled: body.alertEmailEnabled,
      alertEmailApiUrl: body.alertEmailApiUrl,
      alertEmailToken: tokenToSave,
      alertEmailTo: body.alertEmailTo,
      alertEmailServiceId: body.alertEmailServiceId
    });
    return res.json({ success: true, settings: settingsService.safeForClient(), persisted: next });
  }

  async testPrompt(req, res) {
    if (!this.isAdmin(req)) return this.deny(res);
    try {
      const body = req.body || {};
      const result = await AIController.previewReply(
        {
          message: body.testMessage,
          userName: req.session?.user?.name || 'Usuario Teste'
        },
        {
          aiAgentName: body.aiAgentName,
          aiPersonalityPrompt: body.aiPersonalityPrompt,
          aiTemperature: body.aiTemperature,
          aiMaxOutputTokens: body.aiMaxOutputTokens,
          aiMaxReplyChars: body.aiMaxReplyChars,
          aiPreferredProvider: body.aiPreferredProvider,
          aiPreferredModel: body.aiPreferredModel
        }
      );
      return res.json({ success: true, result });
    } catch (error) {
      return res.status(502).json({ error: error.message || 'Falha ao testar prompt' });
    }
  }
}

module.exports = new SettingsController();
