const { MessageModel, UserModel } = require('../models/sequelize-models');

class FastReplyService {
  constructor() {
    this.index = [];
    this.builtAt = 0;
    this.lastError = null;
  }

  normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  tokenize(value) {
    const stopwords = new Set([
      'a', 'o', 'e', 'de', 'do', 'da', 'das', 'dos', 'um', 'uma', 'para', 'com', 'sem',
      'em', 'no', 'na', 'nos', 'nas', 'por', 'que', 'como', 'quando', 'se', 'ou', 'ao',
      'aos', 'as', 'os', 'mais', 'menos', 'muito', 'muita', 'me', 'te', 'voce', 'voces',
      'ele', 'ela', 'eles', 'elas', 'isso', 'isto', 'aquele', 'aquela', 'quero', 'preciso'
    ]);

    return this.normalizeText(value)
      .split(/\s+/)
      .filter(Boolean)
      .filter((token) => token.length >= 3 && !stopwords.has(token));
  }

  buildNgramSet(value, n = 3) {
    const source = this.normalizeText(value).replace(/\s+/g, ' ');
    if (!source) return new Set();
    if (source.length <= n) return new Set([source]);
    const out = new Set();
    for (let i = 0; i <= source.length - n; i += 1) {
      out.add(source.slice(i, i + n));
    }
    return out;
  }

  intersectionSize(a, b) {
    if (!a.size || !b.size) return 0;
    const small = a.size <= b.size ? a : b;
    const large = small === a ? b : a;
    let total = 0;
    small.forEach((item) => {
      if (large.has(item)) total += 1;
    });
    return total;
  }

  jaccardScore(tokensA, tokensB) {
    const a = new Set(tokensA || []);
    const b = new Set(tokensB || []);
    if (!a.size || !b.size) return 0;
    const intersect = this.intersectionSize(a, b);
    const union = a.size + b.size - intersect;
    return union > 0 ? intersect / union : 0;
  }

  diceScore(ngramsA, ngramsB) {
    if (!ngramsA.size || !ngramsB.size) return 0;
    const intersect = this.intersectionSize(ngramsA, ngramsB);
    const denom = ngramsA.size + ngramsB.size;
    return denom > 0 ? (2 * intersect) / denom : 0;
  }

  inferIntent(text) {
    const normalized = this.normalizeText(text);
    if (!normalized) return 'geral';
    if (/(humano|atendente|pessoa|suporte humano|falar com|transferir|representante)/i.test(normalized)) return 'falar_humano';
    if (/(tutorial|passo a passo|guia|manual|documentacao|video|ajuda|artigo)/i.test(normalized)) return 'tutorial';
    if (/(abrir chamado|como abrir chamado|criar chamado|novo chamado|abrir ticket|criar ticket)/i.test(normalized)) return 'chamado';
    if (/(auditoria|modo estrito|financeiro|dre)/i.test(normalized)) return 'auditoria';
    if (/(erro|bug|falha|problema|nao funciona)/i.test(normalized)) return 'suporte_tecnico';
    return 'geral';
  }

  detectTopicLabel(text) {
    const normalized = this.normalizeText(text);
    if (!normalized) return '';
    const map = [
      ['modo_restrito', /(modo restrito|modo estrito|auditoria)/i],
      ['caixa', /(abrir caixa|fechar caixa|caixa)/i],
      ['visao_geral', /(visao geral|dashboard|painel)/i],
      ['chamado', /(chamado|ticket|protocolo)/i]
    ];
    for (const [label, pattern] of map) {
      if (pattern.test(normalized)) return label;
    }
    return '';
  }

  isCacheFresh() {
    const ttlSeconds = Number(process.env.AI_FAST_REPLY_CACHE_TTL_SECONDS || 90);
    const ttlMs = (Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? ttlSeconds : 90) * 1000;
    return this.index.length > 0 && (Date.now() - this.builtAt) <= ttlMs;
  }

  parseRows(rows) {
    const sorted = [...rows].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const lastUserByRoom = new Map();
    const pairs = [];
    const maxGapMinutes = Number(process.env.AI_FAST_REPLY_PAIR_MAX_GAP_MINUTES || 25);
    const maxGapMs = (Number.isFinite(maxGapMinutes) && maxGapMinutes > 0 ? maxGapMinutes : 25) * 60 * 1000;

    for (const row of sorted) {
      const roomId = String(row.room_id || '');
      const content = String(row.content || '').trim();
      const role = String(row.sender?.role || '').toLowerCase();
      if (!roomId || !content) continue;
      if (String(row.type || 'text').toLowerCase() !== 'text') continue;

      if (role === 'system') {
        const prev = lastUserByRoom.get(roomId);
        if (!prev) continue;
        const gap = Math.abs(new Date(row.created_at).getTime() - new Date(prev.created_at).getTime());
        if (gap > maxGapMs) continue;
        if (String(row.feedback_value || '').toLowerCase() === 'down') continue;

        const question = String(prev.content || '').trim();
        const answer = content;
        const questionNorm = this.normalizeText(question);
        const answerNorm = this.normalizeText(answer);
        if (questionNorm.length < 8 || answerNorm.length < 10) continue;

        pairs.push({
          roomId,
          question,
          answer,
          questionNorm,
          questionTokens: this.tokenize(question),
          questionNgrams: this.buildNgramSet(questionNorm),
          intent: this.inferIntent(question),
          topicLabel: this.detectTopicLabel(question),
          feedbackValue: String(row.feedback_value || '').toLowerCase(),
          createdAt: row.created_at
        });
        continue;
      }

      lastUserByRoom.set(roomId, {
        content,
        created_at: row.created_at
      });
    }

    return pairs;
  }

  async rebuildIndex(force = false) {
    if (!force && this.isCacheFresh()) {
      return this.index;
    }
    const limit = Number(process.env.AI_FAST_REPLY_MAX_MESSAGES || 2500);
    const safeLimit = Number.isFinite(limit) && limit > 100 ? Math.min(limit, 8000) : 2500;

    try {
      const rows = await MessageModel.findAll({
        attributes: ['id', 'room_id', 'user_id', 'content', 'type', 'feedback_value', 'created_at'],
        include: [{ model: UserModel, as: 'sender', attributes: ['role'] }],
        where: { type: 'text' },
        order: [['created_at', 'DESC']],
        limit: safeLimit
      });
      const plainRows = rows.map((item) => item.get({ plain: true }));
      this.index = this.parseRows(plainRows);
      this.builtAt = Date.now();
      this.lastError = null;
      return this.index;
    } catch (error) {
      this.lastError = String(error.message || error);
      return this.index;
    }
  }

  invalidate() {
    this.builtAt = 0;
  }

  async findBestReply({ message, intent = '', topicLabel = '' } = {}) {
    const text = String(message || '').trim();
    if (!text) return null;
    if (String(process.env.AI_FAST_REPLY_ENABLED || 'true').trim().toLowerCase() === 'false') return null;

    await this.rebuildIndex(false);
    if (!this.index.length) return null;

    const inputNorm = this.normalizeText(text);
    const inputTokens = this.tokenize(text);
    const inputNgrams = this.buildNgramSet(inputNorm);
    if (!inputNorm || inputTokens.length < 2) return null;

    const normalizedIntent = String(intent || this.inferIntent(text) || 'geral');
    const normalizedTopic = String(topicLabel || this.detectTopicLabel(text) || '');
    const requirePositive = String(process.env.AI_FAST_REPLY_REQUIRE_POSITIVE || 'false').trim().toLowerCase() === 'true';
    const minScore = Number(process.env.AI_FAST_REPLY_MIN_SCORE || 0.6);
    const safeMin = Number.isFinite(minScore) && minScore > 0 ? minScore : 0.6;
    let best = null;

    for (const candidate of this.index) {
      if (requirePositive && candidate.feedbackValue !== 'up') continue;

      const exact = candidate.questionNorm === inputNorm;
      const jaccard = this.jaccardScore(inputTokens, candidate.questionTokens);
      const dice = this.diceScore(inputNgrams, candidate.questionNgrams);
      const intentMatch = normalizedIntent && candidate.intent === normalizedIntent ? 1 : 0;
      const topicMatch = normalizedTopic && candidate.topicLabel === normalizedTopic ? 1 : 0;
      const feedbackBoost = candidate.feedbackValue === 'up' ? 1 : 0;
      const score = exact
        ? 1
        : Math.min(1, (jaccard * 0.48) + (dice * 0.34) + (intentMatch * 0.1) + (topicMatch * 0.05) + (feedbackBoost * 0.03));

      if (score < safeMin) continue;
      if (!best || score > best.score) {
        best = {
          reply: candidate.answer,
          score,
          matchedQuestion: candidate.question,
          matchedAt: candidate.createdAt,
          feedbackValue: candidate.feedbackValue || null,
          intent: candidate.intent,
          topicLabel: candidate.topicLabel
        };
      }
    }

    return best;
  }
}

module.exports = new FastReplyService();
