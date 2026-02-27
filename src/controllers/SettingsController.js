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

    return res.render('dashboard/settings', {
      title: 'Configuracoes - Chat Taiksu',
      user: req.session.user,
      settings: settingsService.safeForClient()
    });
  }

  getSettings(req, res) {
    if (!this.isAdmin(req)) return this.deny(res);
    return res.json({ success: true, settings: settingsService.safeForClient() });
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
          aiMaxReplyChars: body.aiMaxReplyChars
        }
      );
      return res.json({ success: true, result });
    } catch (error) {
      return res.status(502).json({ error: error.message || 'Falha ao testar prompt' });
    }
  }
}

module.exports = new SettingsController();
