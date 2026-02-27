const fs = require('fs');
const path = require('path');

class KnowledgeAdminService {
  constructor() {
    const baseDataDir = String(process.env.DATA_DIR || 'src/data').trim();
    this.dataDir = path.resolve(process.cwd(), baseDataDir);
    this.knowledgeFile = path.join(this.dataDir, 'knowledge.json');
    this.draftFile = path.join(this.dataDir, 'knowledge.draft.json');
    this.importHistoryFile = path.join(this.dataDir, 'kb-import-history.json');
    this.versionsDir = path.join(this.dataDir, 'knowledge_versions');
  }

  ensureStorage() {
    if (!fs.existsSync(this.dataDir)) fs.mkdirSync(this.dataDir, { recursive: true });
    if (!fs.existsSync(this.versionsDir)) fs.mkdirSync(this.versionsDir, { recursive: true });
  }

  nowIsoDate() {
    return new Date().toISOString().slice(0, 10);
  }

  toSlug(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 50) || 'item';
  }

  readJsonArray(filePath) {
    this.ensureStorage();
    if (!fs.existsSync(filePath)) return [];
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('[KB_ADMIN] Falha ao ler JSON:', filePath, error.message);
      return [];
    }
  }

  writeJsonArray(filePath, items) {
    this.ensureStorage();
    const payload = JSON.stringify(Array.isArray(items) ? items : [], null, 2);
    fs.writeFileSync(filePath, payload, 'utf-8');
  }

  getKnowledge() {
    return this.readJsonArray(this.knowledgeFile);
  }

  getDraft() {
    return this.readJsonArray(this.draftFile);
  }

  clearDraft() {
    this.writeJsonArray(this.draftFile, []);
    return [];
  }

  buildTags(text) {
    const normalized = String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    const dictionary = [
      ['chamado', ['chamado', 'ticket', 'solicitacao', 'protocolo']],
      ['humano', ['humano', 'atendente', 'pessoa', 'agente']],
      ['fila', ['fila', 'espera', 'aguardar']],
      ['status', ['status', 'fechado', 'aberto', 'andamento']],
      ['anexo', ['anexo', 'arquivo', 'imagem', 'audio', 'documento']],
      ['pagamento', ['pagamento', 'cobranca', 'boleto', 'cartao', 'pix']],
      ['acesso', ['login', 'senha', 'autenticacao', 'acesso', 'sso']]
    ];

    const tags = [];
    dictionary.forEach(([tag, terms]) => {
      if (terms.some((term) => normalized.includes(term))) {
        tags.push(tag);
      }
    });
    return tags.slice(0, 8);
  }

  inferIntent(text) {
    const normalized = String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    if (/(humano|atendente|agente|transferir)/.test(normalized)) return 'falar_humano';
    if (/(abrir chamado|criar chamado|novo chamado|ticket)/.test(normalized)) return 'abrir_chamado';
    if (/(status|andamento|protocolo|fechado)/.test(normalized)) return 'status_chamado';
    if (/(anexo|arquivo|imagem|audio|documento)/.test(normalized)) return 'enviar_anexo';
    return 'geral';
  }

  inferCategory(text) {
    const intent = this.inferIntent(text);
    if (['falar_humano', 'abrir_chamado', 'status_chamado', 'enviar_anexo'].includes(intent)) {
      return 'atendimento';
    }
    return 'geral';
  }

  splitMarkdownSections(markdown) {
    const source = String(markdown || '').replace(/\r\n/g, '\n');
    const lines = source.split('\n');
    const sections = [];
    let current = null;

    lines.forEach((line) => {
      const heading = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*$/);
      if (heading) {
        if (current && current.content.trim()) sections.push(current);
        current = { title: heading[1].trim(), content: '' };
        return;
      }
      if (!current) current = { title: 'Informacoes gerais', content: '' };
      current.content += `${line}\n`;
    });

    if (current && current.content.trim()) sections.push(current);
    if (sections.length) return sections;

    const paragraphs = source
      .split(/\n\s*\n/g)
      .map((part) => part.trim())
      .filter(Boolean);
    return paragraphs.map((content, idx) => ({
      title: `Topico ${idx + 1}`,
      content
    }));
  }

  chunkContent(content, maxChars = 700) {
    const text = String(content || '').trim().replace(/\n{3,}/g, '\n\n');
    if (!text) return [];
    if (text.length <= maxChars) return [text];

    const chunks = [];
    let cursor = 0;
    while (cursor < text.length) {
      let end = Math.min(cursor + maxChars, text.length);
      if (end < text.length) {
        const lastBreak = text.lastIndexOf('\n', end);
        const lastDot = text.lastIndexOf('. ', end);
        const splitAt = Math.max(lastBreak, lastDot);
        if (splitAt > cursor + 220) end = splitAt + 1;
      }
      const chunk = text.slice(cursor, end).trim();
      if (chunk) chunks.push(chunk);
      cursor = end;
    }
    return chunks;
  }

  parseMarkdownToEntries(markdown, options = {}) {
    const sourceName = String(options.sourceName || 'import_markdown');
    const author = String(options.author || 'sistema');
    const sections = this.splitMarkdownSections(markdown);
    const date = this.nowIsoDate();
    const entries = [];

    sections.forEach((section, sectionIndex) => {
      const chunks = this.chunkContent(section.content, Number(options.maxChars || 700));
      chunks.forEach((chunk, chunkIndex) => {
        const baseText = `${section.title} ${chunk}`;
        const slug = this.toSlug(section.title);
        const id = `kb_${slug}_${sectionIndex + 1}_${chunkIndex + 1}`;
        entries.push({
          id,
          title: section.title,
          content: chunk,
          tags: this.buildTags(baseText),
          url: '',
          category: this.inferCategory(baseText),
          intent: this.inferIntent(baseText),
          audience: 'cliente',
          priority: 3,
          confidence: 0.85,
          status: 'active',
          updatedAt: date,
          owner: author,
          source: sourceName
        });
      });
    });

    return entries;
  }

  importMarkdown(markdown, options = {}) {
    const entries = this.parseMarkdownToEntries(markdown, options);
    this.writeJsonArray(this.draftFile, entries);
    return entries;
  }

  updateDraftItem(itemId, patch = {}) {
    const items = this.getDraft();
    const idx = items.findIndex((item) => String(item.id) === String(itemId));
    if (idx < 0) return null;

    const merged = {
      ...items[idx],
      ...patch,
      id: items[idx].id,
      updatedAt: this.nowIsoDate()
    };
    items[idx] = merged;
    this.writeJsonArray(this.draftFile, items);
    return merged;
  }

  deleteDraftItem(itemId) {
    const items = this.getDraft();
    const next = items.filter((item) => String(item.id) !== String(itemId));
    this.writeJsonArray(this.draftFile, next);
    return { removed: items.length - next.length, items: next };
  }

  publishDraft() {
    const draft = this.getDraft();
    if (!draft.length) return { published: 0, versionFile: null };

    const current = this.getKnowledge();
    const versionFile = path.join(this.versionsDir, `knowledge.${Date.now()}.json`);
    this.writeJsonArray(versionFile, current);
    this.writeJsonArray(this.knowledgeFile, draft);
    this.clearDraft();

    return { published: draft.length, versionFile };
  }

  cloneLiveToDraft() {
    const live = this.getKnowledge();
    const cloned = JSON.parse(JSON.stringify(Array.isArray(live) ? live : []));
    this.writeJsonArray(this.draftFile, cloned);
    return { draftCount: cloned.length };
  }

  listVersions(limit = 20) {
    this.ensureStorage();
    if (!fs.existsSync(this.versionsDir)) return [];
    const files = fs.readdirSync(this.versionsDir)
      .filter((name) => /^knowledge\.\d+\.json$/i.test(name))
      .map((name) => {
        const fullPath = path.join(this.versionsDir, name);
        const stat = fs.statSync(fullPath);
        return {
          file: name,
          fullPath,
          mtime: stat.mtime.toISOString(),
          size: stat.size
        };
      })
      .sort((a, b) => new Date(b.mtime) - new Date(a.mtime));
    return files.slice(0, Math.max(1, Number(limit || 20)));
  }

  restoreVersion(versionFile) {
    const safeName = path.basename(String(versionFile || '')).trim();
    if (!safeName || !/^knowledge\.\d+\.json$/i.test(safeName)) {
      throw new Error('version_file_invalid');
    }
    const target = path.join(this.versionsDir, safeName);
    if (!fs.existsSync(target)) {
      throw new Error('version_file_not_found');
    }

    const backupFile = path.join(this.versionsDir, `knowledge.${Date.now()}.json`);
    const current = this.getKnowledge();
    this.writeJsonArray(backupFile, current);

    const restored = this.readJsonArray(target);
    this.writeJsonArray(this.knowledgeFile, restored);
    return {
      restoredCount: restored.length,
      restoredFrom: safeName,
      backupFile
    };
  }

  getImportHistory(limit = 30) {
    const history = this.readJsonArray(this.importHistoryFile);
    const normalized = (history || [])
      .filter((item) => item && item.ts)
      .sort((a, b) => new Date(b.ts) - new Date(a.ts));
    return normalized.slice(0, Math.max(1, Number(limit || 30)));
  }

  appendImportHistory(entry = {}) {
    const history = this.readJsonArray(this.importHistoryFile);
    const next = [
      {
        ts: new Date().toISOString(),
        sourceName: String(entry.sourceName || 'import.md'),
        imported: Number(entry.imported || 0),
        mode: String(entry.mode || 'replace'),
        autoPublished: Boolean(entry.autoPublished),
        published: Number(entry.published || 0),
        author: String(entry.author || 'sistema'),
        draftCount: Number(entry.draftCount || 0),
        versionFile: entry.versionFile ? String(entry.versionFile) : null
      },
      ...(Array.isArray(history) ? history : [])
    ].slice(0, 200);
    this.writeJsonArray(this.importHistoryFile, next);
    return next[0];
  }

  importFromMarkdown(markdown, options = {}) {
    const sourceName = String(options.sourceName || 'import.md');
    const author = String(options.author || 'sistema');
    const mode = String(options.mode || 'replace').toLowerCase() === 'append' ? 'append' : 'replace';
    const autoPublish = Boolean(options.autoPublish);
    const entries = this.parseMarkdownToEntries(markdown, options);

    const currentDraft = this.getDraft();
    const draft = mode === 'append' ? [...currentDraft, ...entries] : entries;
    this.writeJsonArray(this.draftFile, draft);

    let published = 0;
    let versionFile = null;
    if (autoPublish && draft.length > 0) {
      const result = this.publishDraft();
      published = Number(result.published || 0);
      versionFile = result.versionFile || null;
    }

    const historyItem = this.appendImportHistory({
      sourceName,
      imported: entries.length,
      mode,
      autoPublished: autoPublish,
      published,
      author,
      draftCount: autoPublish ? 0 : draft.length,
      versionFile
    });

    return {
      imported: entries.length,
      mode,
      draftCount: autoPublish ? 0 : draft.length,
      autoPublished: autoPublish,
      published,
      versionFile,
      historyItem
    };
  }

  addSuggestionFromMessage(input = {}) {
    const messageId = String(input.messageId || '').trim();
    if (!messageId) throw new Error('messageId obrigatorio');

    const content = String(input.content || '').trim();
    if (!content) throw new Error('Conteudo da mensagem vazio');

    const normalized = content.replace(/\s+/g, ' ').trim();
    const date = this.nowIsoDate();
    const shortTitle = normalized.split(/[.!?]\s+/)[0].slice(0, 90) || 'Sugestao de resposta da IA';
    const slug = this.toSlug(shortTitle);
    const id = `kb_suggest_${slug}_${messageId.slice(0, 8)}`;

    const draft = this.getDraft();
    const existsIndex = draft.findIndex((item) => String(item?.sourceMessageId || '') === messageId);
    const baseItem = {
      id,
      title: shortTitle,
      content: normalized,
      tags: this.buildTags(normalized),
      url: '',
      category: this.inferCategory(normalized),
      intent: this.inferIntent(normalized),
      audience: 'cliente',
      priority: 3,
      confidence: 0.65,
      status: 'active',
      updatedAt: date,
      owner: String(input.author || 'admin'),
      source: 'feedback_suggestion',
      sourceMessageId: messageId,
      sourceRoomId: String(input.roomId || ''),
      sourceFeedbackValue: String(input.feedbackValue || '')
    };

    if (existsIndex >= 0) {
      draft[existsIndex] = {
        ...draft[existsIndex],
        ...baseItem,
        id: draft[existsIndex].id || id
      };
    } else {
      draft.push(baseItem);
    }

    this.writeJsonArray(this.draftFile, draft);
    return existsIndex >= 0 ? draft[existsIndex] : baseItem;
  }
}

module.exports = new KnowledgeAdminService();
