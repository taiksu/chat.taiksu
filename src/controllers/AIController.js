const settingsService = require('../services/settingsService');
const aiToolService = require('../services/aiToolService');
const eventBrokerService = require('../services/eventBrokerService');

class AIController {
  logAiMetric(event, data = {}) {
    const payload = {
      ts: new Date().toISOString(),
      source: 'ai-controller',
      event,
      ...data
    };
    console.info('[AI_METRIC]', JSON.stringify(payload));
  }

  getInternalToken() {
    return String(process.env.API_AI_TOKEN || '').trim();
  }

  getGeminiApiKey() {
    return String(process.env.GEMINI_API_KEY || '').trim();
  }

  getGeminiModel() {
    return String(process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();
  }

  getAiSettings(overrides = {}) {
    const settings = settingsService.load();
    const personality = String(
      overrides.aiPersonalityPrompt !== undefined
        ? overrides.aiPersonalityPrompt
        : (settings.aiPersonalityPrompt || '')
    ).trim();
    const nameRaw = overrides.aiAgentName !== undefined
      ? overrides.aiAgentName
      : (settings.aiAgentName || process.env.AI_USER_NAME || 'Marina');
    const temperatureRaw = overrides.aiTemperature !== undefined ? overrides.aiTemperature : settings.aiTemperature;
    const maxOutputTokensRaw = overrides.aiMaxOutputTokens !== undefined ? overrides.aiMaxOutputTokens : settings.aiMaxOutputTokens;
    const maxReplyCharsRaw = overrides.aiMaxReplyChars !== undefined ? overrides.aiMaxReplyChars : settings.aiMaxReplyChars;
    return {
      agentName: String(nameRaw || 'Marina').trim() || 'Marina',
      personalityPrompt: personality,
      temperature: Number(temperatureRaw),
      maxOutputTokens: Number(maxOutputTokensRaw),
      maxReplyChars: Number(maxReplyCharsRaw)
    };
  }

  getOllamaBaseUrl() {
    return String(process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').trim().replace(/\/+$/, '');
  }

  getOllamaModel() {
    return String(process.env.OLLAMA_MODEL || process.env.ollama_MODEL || 'gemma3:1b').trim();
  }

  getAllowedProviders() {
    return ['ollama', 'gemini'];
  }

  normalizeProvider(value, fallback = 'ollama') {
    const provider = String(value || '').trim().toLowerCase();
    return this.getAllowedProviders().includes(provider) ? provider : fallback;
  }

  getPreferredProvider(overrides = {}) {
    const fromOverride = this.normalizeProvider(overrides.aiPreferredProvider, '');
    if (fromOverride) return fromOverride;
    const settings = settingsService.load();
    return this.normalizeProvider(settings.aiPreferredProvider, this.getProviderOrderFromEnv()[0] || 'ollama');
  }

  getModelForProvider(provider, overrides = {}) {
    const normalizedProvider = this.normalizeProvider(provider, 'ollama');
    const fromOverrideProvider = this.normalizeProvider(overrides.aiPreferredProvider, '');
    const fromOverrideModel = String(overrides.aiPreferredModel || '').trim();
    if (fromOverrideModel && (!fromOverrideProvider || fromOverrideProvider === normalizedProvider)) {
      return fromOverrideModel;
    }

    const settings = settingsService.load();
    const settingsProvider = this.normalizeProvider(settings.aiPreferredProvider, '');
    const settingsModel = String(settings.aiPreferredModel || '').trim();
    if (settingsModel && settingsProvider === normalizedProvider) {
      return settingsModel;
    }

    return normalizedProvider === 'gemini' ? this.getGeminiModel() : this.getOllamaModel();
  }

  getOllamaApiToken() {
    return String(process.env.OLLAMA_API_TOKEN || '').trim();
  }

  buildOllamaHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const token = this.getOllamaApiToken();
    if (!token) return headers;

    const mode = String(process.env.OLLAMA_AUTH_MODE || 'bearer').trim().toLowerCase();
    if (mode === 'x-api-key') {
      headers['x-api-key'] = token;
      return headers;
    }

    headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  getProviderOrderFromEnv() {
    const raw = String(process.env.AI_PROVIDER_ORDER || 'ollama,gemini')
      .split(',')
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean);
    const allowed = new Set(this.getAllowedProviders());
    const unique = [];
    raw.forEach((item) => {
      if (allowed.has(item) && !unique.includes(item)) unique.push(item);
    });
    return unique.length ? unique : this.getAllowedProviders();
  }

  getProviderOrder(overrides = {}) {
    const ordered = this.getProviderOrderFromEnv();
    const preferred = this.getPreferredProvider(overrides);
    if (!preferred || ordered[0] === preferred || !ordered.includes(preferred)) return ordered;
    return [preferred, ...ordered.filter((item) => item !== preferred)];
  }

  isAutoToolEnabled() {
    return String(process.env.AI_TOOLS_AUTO_ENABLED || 'true').trim().toLowerCase() !== 'false';
  }

  normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  tokenize(value) {
    const normalized = this.normalizeText(value);
    if (!normalized) return [];
    return normalized
      .split(/[^a-z0-9]+/g)
      .map((token) => String(token || '').trim())
      .filter((token) => token.length >= 3);
  }

  buildAutoToolKeywords(payload, tool) {
    const text = [
      tool?.name || '',
      tool?.slug || '',
      tool?.description || ''
    ].join(' ');
    const keywords = new Set(this.tokenize(text));
    const slug = this.normalizeText(tool?.slug || '');

    if (/(chamado|ticket|suporte)/.test(slug)) {
      ['chamado', 'ticket', 'atendente', 'suporte', 'abrir', 'criar'].forEach((item) => keywords.add(item));
    }
    if (/(fechar|encerrar|close)/.test(slug)) {
      ['fechar', 'encerrar', 'finalizar', 'resolver'].forEach((item) => keywords.add(item));
    }
    if (/(status)/.test(slug)) {
      ['status', 'situacao', 'andamento'].forEach((item) => keywords.add(item));
    }
    if (/(auditoria|modo-estrito|modo-restrito)/.test(slug)) {
      ['auditoria', 'restrito', 'estrito', 'caixa'].forEach((item) => keywords.add(item));
    }

    const message = this.normalizeText(payload?.message || '');
    if (/(abrir chamado|criar chamado|abrir ticket|criar ticket)/.test(message) && /(chamado|ticket)/.test(slug)) {
      keywords.add('abrir');
      keywords.add('criar');
      keywords.add('chamado');
    }

    return Array.from(keywords);
  }

  scoreToolForMessage(payload, tool) {
    if (!tool || !tool.enabled) return 0;
    const message = this.normalizeText(payload?.message || '');
    if (!message) return 0;

    const messageTokens = new Set(this.tokenize(message));
    if (!messageTokens.size) return 0;

    const keywords = this.buildAutoToolKeywords(payload, tool);
    let score = 0;
    keywords.forEach((keyword) => {
      if (messageTokens.has(keyword)) score += 1;
    });

    if (/(abrir chamado|criar chamado|abrir ticket|criar ticket)/.test(message) && /(chamado|ticket)/.test(this.normalizeText(tool.slug || ''))) {
      score += 3;
    }

    return score;
  }

  coerceValueBySchema(value, schema = {}) {
    const type = String(schema?.type || '').toLowerCase();
    if (!type) return value;
    if (type === 'string') return value == null ? '' : String(value);
    if (type === 'number') {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    }
    if (type === 'integer') {
      const n = Number(value);
      return Number.isFinite(n) ? Math.trunc(n) : 0;
    }
    if (type === 'boolean') return Boolean(value);
    if (type === 'array') return Array.isArray(value) ? value : (value == null ? [] : [value]);
    if (type === 'object') return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return value;
  }

  buildToolArguments(payload, tool) {
    const message = String(payload?.message || '').trim();
    const user = payload?.user && typeof payload.user === 'object' ? payload.user : {};
    const base = {
      message,
      content: message,
      texto: message,
      query: message,
      question: message,
      roomId: String(payload?.roomId || ''),
      chamadoId: payload?.chamadoId ? String(payload.chamadoId) : '',
      chatState: String(payload?.chatState || 'IA'),
      userId: String(user?.id || ''),
      userName: String(user?.name || ''),
      userRole: String(user?.role || ''),
      userEmail: String(user?.email || '')
    };

    const args = { ...base };
    const schema = tool?.inputSchema && typeof tool.inputSchema === 'object' ? tool.inputSchema : {};
    const properties = schema?.properties && typeof schema.properties === 'object' ? schema.properties : {};
    const required = Array.isArray(schema?.required) ? schema.required.map((item) => String(item)) : [];

    required.forEach((field) => {
      if (args[field] !== undefined) return;
      const normalized = this.normalizeText(field);
      if (/(mensagem|message|texto|descricao|description|detalhe|detalhes|pergunta|query|question)/.test(normalized)) {
        args[field] = message;
      } else if (/(usuario|user|cliente|author)_?id/.test(normalized)) {
        args[field] = String(user?.id || '');
      } else if (/(usuario|user|cliente|author)_?(nome|name)/.test(normalized)) {
        args[field] = String(user?.name || '');
      } else if (/(email)/.test(normalized)) {
        args[field] = String(user?.email || '');
      } else if (/(sala|room)_?id/.test(normalized)) {
        args[field] = String(payload?.roomId || '');
      } else if (/(chamado|ticket)_?id/.test(normalized)) {
        args[field] = payload?.chamadoId ? String(payload.chamadoId) : '';
      } else {
        args[field] = message;
      }
    });

    Object.keys(properties).forEach((key) => {
      if (args[key] === undefined) return;
      args[key] = this.coerceValueBySchema(args[key], properties[key]);
    });

    return args;
  }

  renderToolResultReply({ tool, result }) {
    const name = String(tool?.name || 'ferramenta');
    if (!result || !result.success) {
      return `Tentei executar a ferramenta "${name}", mas ocorreu uma falha tecnica. Vou te encaminhar para um atendente humano no chat.`;
    }

    const data = result?.data;
    if (data && typeof data === 'object') {
      const message = String(data.message || data.msg || data.detail || data.statusText || '').trim();
      if (message) return message;
      if (typeof data.reply === 'string' && data.reply.trim()) return data.reply.trim();
      if (typeof data.text === 'string' && data.text.trim()) return data.text.trim();
    }

    return `Ferramenta "${name}" executada com sucesso.`;
  }

  async runAutoToolIfNeeded(payload = {}) {
    if (!this.isAutoToolEnabled()) return null;

    const tools = await aiToolService.listTools();
    const enabledTools = tools.filter((tool) => tool && tool.enabled);
    if (!enabledTools.length) return null;

    const scored = enabledTools
      .map((tool) => ({ tool, score: this.scoreToolForMessage(payload, tool) }))
      .sort((a, b) => b.score - a.score);

    const selected = scored[0];
    if (!selected || selected.score < 2) return null;

    const args = this.buildToolArguments(payload, selected.tool);
    const result = await aiToolService.runTool(selected.tool, args, {
      roomId: String(payload?.roomId || ''),
      actorId: String(payload?.user?.id || ''),
      userId: String(payload?.user?.id || '')
    });

    return {
      tool: {
        id: selected.tool.id,
        slug: selected.tool.slug,
        name: selected.tool.name
      },
      score: selected.score,
      args,
      result
    };
  }

  isAuthorized(req) {
    const required = this.getInternalToken();
    if (!required) return true;
    const sent = String(req.headers['x-ai-token'] || '').trim();
    return sent && sent === required;
  }

  buildSystemInstruction(overrides = {}) {
    const ai = this.getAiSettings(overrides);
    return [
      `Voce e a Assistente ${ai.agentName} da Taiksu IA para primeiro atendimento.`,
      'Responda sempre em portugues do Brasil.',
      'Seja objetiva, clara e util.',
      'Cumprimente apenas na primeira interacao da conversa; depois responda direto ao ponto.',
      'Nao repita saudacao, nome do usuario ou frase de abertura em toda resposta.',
      'Nao repita o mesmo texto da resposta anterior; se houver repeticao, reformule com palavras diferentes.',
      'Se o usuario mudar de assunto, abandone imediatamente o topico anterior e responda somente o novo tema.',
      'Se o novo tema nao estiver claro, faca 1 pergunta curta de esclarecimento.',
      'Nao invente nem altere o nome do usuario; se usar nome, use exatamente o nome informado no prompt.',
      'Quando houver base de conhecimento enviada, use essa base como fonte principal.',
      'Se a resposta nao estiver na base enviada, diga que precisa de mais informacoes ou ofereca humano.',
      'Nunca coloque links no texto da resposta.',
      'Nunca use placeholders como [](), [link], ou URL incompleta.',
      'Quando precisar escalonar, diga em texto curto que vai encaminhar para atendente humano no proprio chat.',
      'Nao inclua link de abrir chamado.',
      'Se o usuario pedir tutorial e nao houver base suficiente, encaminhe para atendente humano.',
      'Ofereca opcao de falar com atendente humano apenas quando houver bloqueio real ou pedido explicito do usuario.',
      'Nao invente dados; quando faltar contexto, peca informacao.',
      'Evite encerrar toda resposta com a mesma pergunta padrao.',
      'Mantenha no maximo 5 linhas e ate 420 caracteres.'
      ,
      ai.personalityPrompt ? `Personalidade configurada: ${ai.personalityPrompt}` : ''
    ].join(' ');
  }

  getMaxReplyChars(overrides = {}) {
    const settingsValue = Number(this.getAiSettings(overrides).maxReplyChars);
    if (Number.isFinite(settingsValue) && settingsValue >= 120) return settingsValue;
    const envValue = Number(process.env.AI_MAX_REPLY_CHARS || 420);
    return Number.isFinite(envValue) && envValue >= 120 ? envValue : 420;
  }

  getTemperature(defaultValue = 0.25, overrides = {}) {
    const n = Number(this.getAiSettings(overrides).temperature);
    if (!Number.isFinite(n)) return defaultValue;
    return Math.max(0, Math.min(2, n));
  }

  getMaxOutputTokens(defaultValue = 280, overrides = {}) {
    const n = Number(this.getAiSettings(overrides).maxOutputTokens);
    if (!Number.isFinite(n)) return defaultValue;
    return Math.max(64, Math.min(2048, Math.floor(n)));
  }

  sanitizeReplyText(text, overrides = {}) {
    let safe = String(text || '').replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!safe) return '';
    safe = safe
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/gi, '$1')
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/\[\]\(\)/g, '')
      .trim();
    const maxChars = this.getMaxReplyChars(overrides);
    if (safe.length > maxChars) {
      safe = `${safe.slice(0, maxChars - 3).trim()}...`;
    }
    return safe;
  }

  buildUserPrompt(payload) {
    const roomId = String(payload.roomId || '');
    const chamadoId = payload.chamadoId ? String(payload.chamadoId) : '';
    const chatState = String(payload.chatState || 'IA');
    const userName = String(payload?.user?.name || 'Usuario');
    const message = String(payload.message || '');
    const context = Array.isArray(payload.context) ? payload.context.slice(-10) : [];
    const contextDocs = Array.isArray(payload.contextDocs) ? payload.contextDocs.slice(0, 5) : [];
    const memory = payload && typeof payload.memory === 'object' && payload.memory ? payload.memory : null;

    const history = context.map((item, idx) => {
      const role = String(item.role || 'user');
      const content = String(item.content || '');
      return `${idx + 1}. [${role}] ${content}`;
    }).join('\n');
    const hadAssistantContext = context.some((item) => String(item?.role || '').toLowerCase() === 'assistant');

    const docsBlock = contextDocs.length
      ? contextDocs.map((doc, idx) => {
        const title = String(doc?.title || 'Sem titulo');
        const id = String(doc?.id || '');
        const url = String(doc?.url || '');
        const snippet = String(doc?.snippet || '');
        return `${idx + 1}. [${id}] ${title}\nURL: ${url || 'n/a'}\nTrecho: ${snippet}`;
      }).join('\n\n')
      : '';

    return [
      `Sala: ${roomId || 'n/a'}`,
      `Chamado: ${chamadoId || 'n/a'}`,
      `Estado atual: ${chatState}`,
      `Usuario: ${userName}`,
      `Nome exato do usuario: ${userName}`,
      `Ja houve resposta da assistente neste chat: ${hadAssistantContext ? 'sim' : 'nao'}`,
      memory
        ? `Memoria curta da conversa:\n- topico: ${String(memory.topic || 'n/a')}\n- intencao: ${String(memory.intent || 'geral')}\n- resumo: ${String(memory.summary || 'n/a')}\n- ultima msg usuario: ${String(memory.lastUserMessage || 'n/a')}\n- ultima msg assistente: ${String(memory.lastAiMessage || 'n/a')}`
        : 'Sem memoria curta registrada.',
      `Mensagem atual: ${message}`,
      docsBlock ? `Base de conhecimento recuperada:\n${docsBlock}` : 'Sem base de conhecimento recuperada.',
      history ? `Contexto recente:\n${history}` : 'Sem contexto previo.'
    ].join('\n\n');
  }

  extractTextFromGeminiResponse(data) {
    const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
    if (!candidates.length) return '';
    const parts = Array.isArray(candidates[0]?.content?.parts) ? candidates[0].content.parts : [];
    return parts
      .map((part) => String(part?.text || '').trim())
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  extractUsageFromGemini(data) {
    const usage = data?.usageMetadata || {};
    return {
      promptTokens: Number(usage.promptTokenCount || 0),
      completionTokens: Number(usage.candidatesTokenCount || 0),
      totalTokens: Number(usage.totalTokenCount || 0)
    };
  }

  extractTextFromOllama(data) {
    if (typeof data?.response === 'string') return data.response.trim();
    if (typeof data?.message?.content === 'string') return data.message.content.trim();
    return '';
  }

  extractUsageFromOllama(data) {
    const promptEvalCount = Number(data?.prompt_eval_count || 0);
    const evalCount = Number(data?.eval_count || 0);
    return {
      promptTokens: promptEvalCount,
      completionTokens: evalCount,
      totalTokens: promptEvalCount + evalCount
    };
  }

  async listOllamaModels() {
    const baseUrl = this.getOllamaBaseUrl();
    const response = await fetch(`${baseUrl}/api/tags`, {
      method: 'GET',
      headers: this.buildOllamaHeaders()
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`ollama_http_${response.status}:${data?.error || 'unknown'}`);
    }
    const models = Array.isArray(data?.models) ? data.models : [];
    return models
      .map((item) => String(item?.name || '').trim())
      .filter(Boolean);
  }

  async listGeminiModels() {
    const apiKey = this.getGeminiApiKey();
    if (!apiKey) return [];

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      { method: 'GET' }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`gemini_http_${response.status}:${data?.error?.message || 'unknown'}`);
    }

    const models = Array.isArray(data?.models) ? data.models : [];
    return models
      .filter((item) => Array.isArray(item?.supportedGenerationMethods)
        && item.supportedGenerationMethods.includes('generateContent'))
      .map((item) => String(item?.name || '').trim().replace(/^models\//i, ''))
      .filter(Boolean);
  }

  getConfiguredCustomModels() {
    const settings = settingsService.load();
    const raw = Array.isArray(settings.aiCustomModels) ? settings.aiCustomModels : [];
    return raw
      .map((entry) => String(entry || '').trim())
      .filter(Boolean)
      .map((entry) => {
        const idx = entry.indexOf(':');
        if (idx <= 0) return null;
        const provider = this.normalizeProvider(entry.slice(0, idx), '');
        const model = String(entry.slice(idx + 1) || '').trim();
        if (!provider || !model) return null;
        return { provider, model };
      })
      .filter(Boolean);
  }

  async listAvailableModels(overrides = {}) {
    const preferredProvider = this.getPreferredProvider(overrides);
    const preferredModel = this.getModelForProvider(preferredProvider, overrides);
    const providers = this.getAllowedProviders();
    const custom = this.getConfiguredCustomModels();
    const byProvider = {
      ollama: [],
      gemini: []
    };
    const errors = {};

    for (const item of custom) {
      byProvider[item.provider].push(item.model);
    }

    try {
      const ollamaModels = await this.listOllamaModels();
      byProvider.ollama.push(...ollamaModels);
    } catch (error) {
      errors.ollama = error.message;
    }

    try {
      const geminiModels = await this.listGeminiModels();
      byProvider.gemini.push(...geminiModels);
    } catch (error) {
      errors.gemini = error.message;
    }

    providers.forEach((provider) => {
      const fallbackModel = provider === 'gemini' ? this.getGeminiModel() : this.getOllamaModel();
      byProvider[provider].push(fallbackModel);
      if (provider === preferredProvider) byProvider[provider].push(preferredModel);
      byProvider[provider] = Array.from(new Set(byProvider[provider].filter(Boolean)));
    });

    return {
      providers: providers.map((provider) => ({
        provider,
        models: byProvider[provider] || [],
        error: errors[provider] || null
      })),
      selected: {
        provider: preferredProvider,
        model: preferredModel
      },
      providerOrder: this.getProviderOrder(overrides)
    };
  }

  async callGemini({ userPrompt, systemInstruction, overrides = {} }) {
    const apiKey = this.getGeminiApiKey();
    if (!apiKey) throw new Error('missing_gemini_api_key');

    const model = this.getModelForProvider('gemini', overrides);
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: this.getTemperature(0.25, overrides),
            maxOutputTokens: this.getMaxOutputTokens(280, overrides)
          }
        })
      }
    );

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`gemini_http_${response.status}:${data?.error?.message || 'unknown'}`);
    }

    const reply = this.sanitizeReplyText(this.extractTextFromGeminiResponse(data), overrides);
    if (!reply) throw new Error('gemini_empty_reply');

    return {
      provider: 'gemini',
      model,
      reply,
      usage: this.extractUsageFromGemini(data)
    };
  }

  async callOllama({ userPrompt, systemInstruction, overrides = {} }) {
    const baseUrl = this.getOllamaBaseUrl();
    const model = this.getModelForProvider('ollama', overrides);
    const prompt = `${systemInstruction}\n\n${userPrompt}`;

    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: this.buildOllamaHeaders(),
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: this.getTemperature(Number(process.env.OLLAMA_TEMPERATURE || 0.25), overrides),
          num_predict: this.getMaxOutputTokens(Number(process.env.OLLAMA_MAX_TOKENS || 280), overrides),
          top_p: Number(process.env.OLLAMA_TOP_P || 0.9),
          repeat_penalty: Number(process.env.OLLAMA_REPEAT_PENALTY || 1.1)
        }
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`ollama_http_${response.status}:${data?.error || 'unknown'}`);
    }

    const reply = this.sanitizeReplyText(this.extractTextFromOllama(data), overrides);
    if (!reply) throw new Error('ollama_empty_reply');

    return {
      provider: 'ollama',
      model,
      reply,
      usage: this.extractUsageFromOllama(data)
    };
  }

  async tryProviders({ providers, userPrompt, systemInstruction, roomId, chamadoId, chatState, overrides = {} }) {
    const errors = [];

    for (const provider of providers) {
      const startedAt = Date.now();
      try {
        const result = provider === 'ollama'
          ? await this.callOllama({ userPrompt, systemInstruction, overrides })
          : await this.callGemini({ userPrompt, systemInstruction, overrides });

        this.logAiMetric('provider_success', {
          provider,
          model: result.model,
          roomId,
          chamadoId,
          chatState,
          latencyMs: Date.now() - startedAt
        });
        return result;
      } catch (error) {
        errors.push({ provider, error: error.message });
        this.logAiMetric('provider_error', {
          provider,
          roomId,
          chamadoId,
          chatState,
          latencyMs: Date.now() - startedAt,
          error: error.message
        });
      }
    }

    const joined = errors.map((item) => `${item.provider}:${item.error}`).join(' | ');
    throw new Error(joined || 'all_providers_failed');
  }

  async generateFirstContact(payload = {}, overrides = {}) {
    const startedAt = Date.now();
    const roomId = String(payload.roomId || '');
    const chamadoId = payload.chamadoId ? String(payload.chamadoId) : '';
    const chatState = String(payload.chatState || 'IA');

    const providers = this.getProviderOrder(overrides);
    const userPrompt = this.buildUserPrompt(payload);
    const systemInstruction = this.buildSystemInstruction(overrides);

    let toolExecution = null;
    try {
      toolExecution = await this.runAutoToolIfNeeded(payload);
      if (toolExecution) {
        const toolLatencyMs = Date.now() - startedAt;
        const toolReply = this.sanitizeReplyText(
          this.renderToolResultReply({ tool: toolExecution.tool, result: toolExecution.result }),
          overrides
        );
        this.logAiMetric('tool_auto_execution', {
          roomId,
          chamadoId,
          chatState,
          tool: toolExecution.tool,
          score: toolExecution.score,
          success: Boolean(toolExecution?.result?.success),
          latencyMs: toolLatencyMs
        });
        eventBrokerService.publishAlias('AI_TOOL_EXECUTED', {
          userId: String(payload?.user?.id || ''),
          priority: toolExecution?.result?.success ? 'normal' : 'high',
          payload: {
            roomId: String(roomId || ''),
            chamadoId: String(chamadoId || ''),
            tool: String(toolExecution?.tool?.slug || ''),
            ok: Boolean(toolExecution?.result?.success),
            source: 'chat-taiksu'
          }
        }).catch(() => {});

        return {
          success: true,
          provider: 'tool',
          model: `tool:${toolExecution.tool.slug}`,
          reply: toolReply,
          usage: null,
          latencyMs: toolLatencyMs,
          tool: toolExecution.tool,
          toolResult: toolExecution.result
        };
      }
    } catch (toolError) {
      this.logAiMetric('tool_auto_execution_error', {
        roomId,
        chamadoId,
        chatState,
        error: toolError.message
      });
    }

    const result = await this.tryProviders({
      providers,
      userPrompt,
      systemInstruction,
      roomId,
      chamadoId,
      chatState,
      overrides
    });

    return {
      success: true,
      provider: result.provider,
      model: result.model,
      reply: result.reply,
      usage: result.usage || null,
      latencyMs: Date.now() - startedAt
    };
  }

  async firstContact(req, res) {
    const startedAt = Date.now();
    try {
      const payload = req.body || {};
      const roomId = String(payload.roomId || '');
      const chamadoId = payload.chamadoId ? String(payload.chamadoId) : '';
      const chatState = String(payload.chatState || 'IA');
      const inputChars = String(payload.message || '').length;

      if (!this.isAuthorized(req)) {
        this.logAiMetric('unauthorized', { roomId, chamadoId, chatState });
        return res.status(401).json({ error: 'Nao autorizado para API de IA' });
      }

      const result = await this.generateFirstContact(payload, {});

      const latencyMs = Date.now() - startedAt;
      this.logAiMetric('success', {
        roomId,
        chamadoId,
        chatState,
        provider: result.provider,
        model: result.model,
        latencyMs,
        inputChars,
        outputChars: result.reply.length,
        usage: result.usage || null
      });

      return res.json({
        success: true,
        provider: result.provider,
        model: result.model,
        reply: result.reply,
        usage: result.usage || null,
        latencyMs
      });
    } catch (error) {
      this.logAiMetric('exception', {
        latencyMs: Date.now() - startedAt,
        error: error.message
      });
      return res.status(502).json({ error: error.message || 'Falha nos provedores de IA' });
    }
  }

  async previewReply(payload = {}, overrides = {}) {
    const previewPayload = {
      roomId: 'preview-room',
      chamadoId: null,
      chatState: 'IA',
      message: String(payload.message || '').trim() || 'Olá, preciso de ajuda.',
      user: {
        id: 'preview-user',
        name: String(payload.userName || 'Usuario Teste'),
        role: 'user'
      },
      context: Array.isArray(payload.context) ? payload.context : [],
      contextDocs: Array.isArray(payload.contextDocs) ? payload.contextDocs : [],
      options: { offerHumanHandoff: true }
    };
    return this.generateFirstContact(previewPayload, overrides);
  }

  parseSuggestedTags(rawText) {
    const source = String(rawText || '').trim();
    if (!source) return [];
    let list = [];
    try {
      const parsed = JSON.parse(source);
      if (Array.isArray(parsed)) list = parsed;
    } catch (_err) {
      list = source.split(/[\n,;]+/g);
    }
    return Array.from(new Set(
      list
        .map((item) => String(item || '').trim().toLowerCase())
        .map((item) => item.replace(/[^a-z0-9_\- ]+/g, '').trim().replace(/\s+/g, '_'))
        .filter((item) => item.length >= 2)
    )).slice(0, 8);
  }

  async suggestKnowledgeTags(input = '', overrides = {}) {
    const text = String(input || '').trim().slice(0, 2500);
    if (!text) return [];
    const providers = this.getProviderOrder(overrides);
    const systemInstruction = [
      'Voce gera tags curtas para base de conhecimento.',
      'Retorne somente um JSON array valido de strings.',
      'Use portugues, minusculas, sem acentos e no maximo 8 tags.',
      'Evite frases longas e redundancias.'
    ].join(' ');
    const userPrompt = [
      'Gere tags para este item de conhecimento.',
      `Conteudo:\n${text}`,
      'Formato obrigatorio da resposta: ["tag1","tag2"]'
    ].join('\n\n');

    const result = await this.tryProviders({
      providers,
      userPrompt,
      systemInstruction,
      roomId: 'kb-tags',
      chamadoId: '',
      chatState: 'KB_TAGS',
      overrides
    });
    return this.parseSuggestedTags(result.reply || '');
  }
}

module.exports = new AIController();

