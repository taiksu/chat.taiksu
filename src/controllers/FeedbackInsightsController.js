const { Op } = require('sequelize');
const { MessageModel, UserModel } = require('../models/sequelize-models');
const knowledgeAdmin = require('../services/knowledgeAdminService');

class FeedbackInsightsController {
  isAdmin(req) {
    return String(req.session?.user?.role || '').toLowerCase() === 'admin';
  }

  denyPage(req, res) {
    return res.status(403).render('error', {
      title: 'Acesso negado',
      message: 'Apenas administradores podem acessar os insights de feedback',
      user: req.session.user
    });
  }

  denyApi(res) {
    return res.status(403).json({ error: 'Acesso restrito para admin' });
  }

  async page(req, res) {
    if (!this.isAdmin(req)) return this.denyPage(req, res);
    return res.render('dashboard/feedback-insights', {
      title: 'Insights de Feedback IA - Chat Taiksu',
      user: req.session.user
    });
  }

  normalizeContent(content) {
    return String(content || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  canonicalContent(content) {
    return this.normalizeContent(content).toLowerCase().slice(0, 800);
  }

  parseDays(value) {
    const days = Number(value || 30);
    if (!Number.isFinite(days)) return 30;
    if (days < 1) return 1;
    if (days > 365) return 365;
    return Math.floor(days);
  }

  async buildTopFeedback(value, days, limit) {
    const minDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));

    const rows = await MessageModel.findAll({
      where: {
        feedback_value: value,
        type: 'text',
        feedback_at: { [Op.gte]: minDate }
      },
      include: [{
        model: UserModel,
        as: 'sender',
        attributes: ['id', 'name', 'role'],
        required: true,
        where: { role: 'system' }
      }],
      attributes: ['id', 'room_id', 'content', 'feedback_at', 'created_at'],
      order: [['feedback_at', 'DESC']],
      limit: Math.max(200, limit * 60)
    });

    const grouped = new Map();
    rows.forEach((row) => {
      const plain = row.get({ plain: true });
      const content = this.normalizeContent(plain.content);
      if (!content) return;

      const key = this.canonicalContent(content);
      const existing = grouped.get(key) || {
        key,
        content,
        count: 0,
        sampleMessageId: String(plain.id),
        roomId: String(plain.room_id || ''),
        lastFeedbackAt: plain.feedback_at || plain.created_at || null
      };

      existing.count += 1;
      if (!existing.lastFeedbackAt || new Date(plain.feedback_at) > new Date(existing.lastFeedbackAt)) {
        existing.lastFeedbackAt = plain.feedback_at || plain.created_at || existing.lastFeedbackAt;
        existing.sampleMessageId = String(plain.id);
        existing.roomId = String(plain.room_id || existing.roomId || '');
      }
      grouped.set(key, existing);
    });

    return Array.from(grouped.values())
      .sort((a, b) => {
        const byCount = Number(b.count || 0) - Number(a.count || 0);
        if (byCount !== 0) return byCount;
        return new Date(b.lastFeedbackAt || 0) - new Date(a.lastFeedbackAt || 0);
      })
      .slice(0, limit);
  }

  async data(req, res) {
    if (!this.isAdmin(req)) return this.denyApi(res);

    try {
      const limit = Math.min(30, Math.max(1, Number(req.query.limit || 10)));
      const days = this.parseDays(req.query.days);
      const [topDown, topUp] = await Promise.all([
        this.buildTopFeedback('down', days, limit),
        this.buildTopFeedback('up', days, limit)
      ]);

      return res.json({
        success: true,
        filters: { limit, days },
        topDown,
        topUp
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async suggestToKnowledge(req, res) {
    if (!this.isAdmin(req)) return this.denyApi(res);

    try {
      const messageId = String(req.params?.messageId || '').trim();
      if (!messageId) {
        return res.status(400).json({ error: 'messageId obrigatorio' });
      }

      const row = await MessageModel.findByPk(messageId, {
        include: [{
          model: UserModel,
          as: 'sender',
          attributes: ['id', 'name', 'role'],
          required: false
        }]
      });

      if (!row) return res.status(404).json({ error: 'Mensagem nao encontrada' });
      const plain = row.get({ plain: true });
      if (String(plain?.sender?.role || '').toLowerCase() !== 'system') {
        return res.status(400).json({ error: 'Apenas mensagens da IA podem virar sugestao de conhecimento' });
      }

      const item = knowledgeAdmin.addSuggestionFromMessage({
        messageId: plain.id,
        roomId: plain.room_id,
        content: plain.content,
        feedbackValue: plain.feedback_value,
        author: req.session?.user?.name || 'admin'
      });

      return res.json({
        success: true,
        item
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new FeedbackInsightsController();
