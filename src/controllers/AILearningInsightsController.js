const fs = require('fs');
const aiLearningLogService = require('../services/aiLearningLogService');

class AILearningInsightsController {
  isAdmin(req) {
    return String(req.session?.user?.role || '').toLowerCase() === 'admin';
  }

  denyPage(req, res) {
    return res.status(403).render('error', {
      title: 'Acesso negado',
      message: 'Apenas administradores podem acessar os insights de aprendizado da IA',
      user: req.session.user
    });
  }

  denyApi(res) {
    return res.status(403).json({ error: 'Acesso restrito para admin' });
  }

  parseDays(value) {
    const days = Number(value || 7);
    if (!Number.isFinite(days)) return 7;
    if (days < 1) return 1;
    if (days > 180) return 180;
    return Math.floor(days);
  }

  parseLimit(value, fallback = 20, max = 200) {
    const n = Number(value || fallback);
    if (!Number.isFinite(n)) return fallback;
    if (n < 1) return 1;
    if (n > max) return max;
    return Math.floor(n);
  }

  parseEventRow(line) {
    const raw = String(line || '').trim();
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch (_err) {
      return null;
    }
  }

  async readRows({ days, maxRows }) {
    const filePath = aiLearningLogService.getFilePath();
    if (!fs.existsSync(filePath)) {
      return [];
    }

    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    const content = await fs.promises.readFile(filePath, 'utf8');
    const lines = content.split(/\r?\n/g);
    const rows = [];
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      if (rows.length >= maxRows) break;
      const row = this.parseEventRow(lines[i]);
      if (!row) continue;
      const tsMs = new Date(row.ts || 0).getTime();
      if (!Number.isFinite(tsMs) || tsMs < cutoff) continue;
      rows.push(row);
    }
    return rows;
  }

  detectSignalType(row) {
    const event = String(row?.event || '').trim().toLowerCase();
    if (event === 'reply_quality_flag') {
      const quality = row?.quality || {};
      if (quality?.topicMismatch) return 'topic_mismatch';
      if (quality?.likelyLoop || quality?.repeatedClarification) return 'loop_risk';
      return 'quality_flag';
    }
    if (event === 'assistant_feedback' && String(row?.feedbackValue || '').toLowerCase() === 'down') {
      return 'feedback_down';
    }
    return '';
  }

  aggregate(rows, { roomIdFilter = '' } = {}) {
    const roomFilter = String(roomIdFilter || '').trim();
    const filtered = rows.filter((row) => {
      if (!roomFilter) return true;
      return String(row?.roomId || '') === roomFilter;
    });

    const byEvent = {};
    const byRoom = new Map();
    const flags = [];
    const users = new Set();
    const rooms = new Set();

    filtered.forEach((row) => {
      const event = String(row?.event || 'unknown');
      byEvent[event] = Number(byEvent[event] || 0) + 1;

      const roomId = String(row?.roomId || '').trim();
      if (roomId) rooms.add(roomId);

      const userId = String(row?.userId || '').trim();
      if (userId) users.add(userId);

      const roomStats = byRoom.get(roomId) || {
        roomId: roomId || 'n/a',
        totalEvents: 0,
        qualityFlags: 0,
        feedbackDown: 0,
        lastAt: ''
      };
      roomStats.totalEvents += 1;
      const signalType = this.detectSignalType(row);
      if (signalType === 'feedback_down') roomStats.feedbackDown += 1;
      if (signalType === 'topic_mismatch' || signalType === 'loop_risk' || signalType === 'quality_flag') {
        roomStats.qualityFlags += 1;
      }
      const rowTs = String(row?.ts || '');
      if (rowTs && (!roomStats.lastAt || new Date(rowTs) > new Date(roomStats.lastAt))) {
        roomStats.lastAt = rowTs;
      }
      byRoom.set(roomId, roomStats);

      if (signalType) {
        flags.push({
          ts: row?.ts || null,
          roomId: roomId || 'n/a',
          userId: userId || '',
          event,
          signalType,
          quality: row?.quality || null,
          feedbackValue: row?.feedbackValue || null,
          userMessage: row?.userMessage || '',
          aiReply: row?.aiReply || ''
        });
      }
    });

    const topRooms = Array.from(byRoom.values())
      .sort((a, b) => {
        const byFlags = Number(b.qualityFlags || 0) - Number(a.qualityFlags || 0);
        if (byFlags !== 0) return byFlags;
        const byDown = Number(b.feedbackDown || 0) - Number(a.feedbackDown || 0);
        if (byDown !== 0) return byDown;
        return new Date(b.lastAt || 0) - new Date(a.lastAt || 0);
      })
      .slice(0, 20);

    const recentFlags = flags
      .sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0))
      .slice(0, 80);

    const loopFlags = flags.filter((item) => item.signalType === 'loop_risk').length;
    const topicMismatchFlags = flags.filter((item) => item.signalType === 'topic_mismatch').length;
    const feedbackDown = flags.filter((item) => item.signalType === 'feedback_down').length;

    return {
      totals: {
        events: filtered.length,
        rooms: rooms.size,
        users: users.size,
        loopFlags,
        topicMismatchFlags,
        feedbackDown
      },
      byEvent,
      topRooms,
      recentFlags
    };
  }

  async page(req, res) {
    if (!this.isAdmin(req)) return this.denyPage(req, res);
    return res.render('dashboard/ai-learning-insights', {
      title: 'IA Aprendizado - Chat Taiksu',
      user: req.session.user,
      activeNav: 'ai',
      aiTab: 'learning'
    });
  }

  async data(req, res) {
    if (!this.isAdmin(req)) return this.denyApi(res);
    try {
      const days = this.parseDays(req.query.days);
      const maxRows = this.parseLimit(req.query.maxRows, 2500, 10000);
      const roomId = String(req.query.roomId || '').trim();
      const rows = await this.readRows({ days, maxRows });
      const aggregation = this.aggregate(rows, { roomIdFilter: roomId });

      return res.json({
        success: true,
        filters: {
          days,
          maxRows,
          roomId: roomId || ''
        },
        ...aggregation
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new AILearningInsightsController();
