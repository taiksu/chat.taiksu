const fs = require('fs');
const path = require('path');

class KnowledgeBaseService {
  constructor() {
    const baseDataDir = String(process.env.DATA_DIR || 'src/data').trim();
    this.filePath = path.resolve(process.cwd(), baseDataDir, 'knowledge.json');
    this.cache = [];
    this.lastMtimeMs = 0;
  }

  normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  tokenize(value) {
    const stopwords = new Set([
      'a', 'o', 'e', 'de', 'do', 'da', 'das', 'dos', 'um', 'uma', 'para', 'com', 'sem',
      'em', 'no', 'na', 'nos', 'nas', 'por', 'que', 'como', 'quando', 'se', 'ou', 'ao',
      'aos', 'as', 'os', 'mais', 'menos', 'muito', 'muita', 'me', 'te', 'voce', 'voces',
      'ele', 'ela', 'eles', 'elas', 'isso', 'isto', 'aquele', 'aquela', 'quero', 'preciso'
    ]);

    const raw = this.normalizeText(value)
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);

    return raw.filter((token) => token.length >= 3 && !stopwords.has(token));
  }

  loadIfNeeded() {
    if (!fs.existsSync(this.filePath)) {
      this.cache = [];
      this.lastMtimeMs = 0;
      return;
    }

    const stat = fs.statSync(this.filePath);
    if (stat.mtimeMs <= this.lastMtimeMs && this.cache.length) return;

    try {
      const data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
      this.cache = Array.isArray(data) ? data : [];
      this.lastMtimeMs = stat.mtimeMs;
    } catch (error) {
      console.error('[RAG] Falha ao carregar knowledge.json:', error.message);
      this.cache = [];
      this.lastMtimeMs = stat.mtimeMs;
    }
  }

  buildSearchText(doc) {
    const title = String(doc?.title || '');
    const content = String(doc?.content || '');
    const tags = Array.isArray(doc?.tags) ? doc.tags.join(' ') : '';
    return this.normalizeText(`${title} ${content} ${tags}`);
  }

  buildSnippet(content, tokens) {
    const source = String(content || '').trim();
    if (!source) return '';
    if (!tokens.length) return source.slice(0, 220);

    const lower = this.normalizeText(source);
    let idx = -1;
    for (const token of tokens) {
      idx = lower.indexOf(token);
      if (idx >= 0) break;
    }
    if (idx < 0) return source.slice(0, 220);

    const start = Math.max(0, idx - 60);
    const end = Math.min(source.length, idx + 180);
    const chunk = source.slice(start, end).trim();
    return start > 0 ? `...${chunk}` : chunk;
  }

  scoreDoc(doc, tokens) {
    if (!tokens.length) return 0;
    const title = this.normalizeText(doc?.title || '');
    const text = this.buildSearchText(doc);
    let score = 0;

    for (const token of tokens) {
      if (title.includes(token)) score += 4;
      if (text.includes(token)) score += 2;
    }

    return score;
  }

  retrieve(query, options = {}) {
    this.loadIfNeeded();
    const limit = Number(options.limit || 3);
    const minScore = Number(options.minScore || 2);
    const tokens = this.tokenize(query);
    if (!tokens.length || !this.cache.length) return [];

    const ranked = this.cache
      .map((doc) => {
        const score = this.scoreDoc(doc, tokens);
        return {
          id: String(doc?.id || ''),
          title: String(doc?.title || ''),
          url: String(doc?.url || ''),
          content: String(doc?.content || ''),
          score
        };
      })
      .filter((doc) => doc.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((doc) => ({
        id: doc.id,
        title: doc.title,
        url: doc.url,
        score: doc.score,
        snippet: this.buildSnippet(doc.content, tokens)
      }));

    return ranked;
  }
}

module.exports = new KnowledgeBaseService();
