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

  getOllamaBaseUrl() {
    return String(process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').trim().replace(/\/+$/, '');
  }

  getOllamaModel() {
    return String(process.env.OLLAMA_MODEL || 'gemma3:1b').trim();
  }

  getProviderOrder() {
    const raw = String(process.env.AI_PROVIDER_ORDER || 'ollama,gemini')
      .split(',')
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean);
    const allowed = new Set(['ollama', 'gemini']);
    const unique = [];
    raw.forEach((item) => {
      if (allowed.has(item) && !unique.includes(item)) unique.push(item);
    });
    return unique.length ? unique : ['ollama', 'gemini'];
  }

  isAuthorized(req) {
    const required = this.getInternalToken();
    if (!required) return true;
    const sent = String(req.headers['x-ai-token'] || '').trim();
    return sent && sent === required;
  }

  buildSystemInstruction() {
    return [
      'Voce e a Assistente Marina da Taiksu IA para primeiro atendimento.',
      'Responda sempre em portugues do Brasil.',
      'Seja objetiva, clara e util.',
      'Cumprimente apenas na primeira interacao da conversa; depois responda direto ao ponto.',
      'Nao invente nem altere o nome do usuario; se usar nome, use exatamente o nome informado no prompt.',
      'Quando houver base de conhecimento enviada, use essa base como fonte principal.',
      'Se a resposta nao estiver na base enviada, diga que precisa de mais informacoes ou ofereca humano.',
      'Nao inclua link de abrir chamado quando ja houver base suficiente para responder.',
      'Se o usuario pedir tutorial e nao houver base suficiente, indique abrir chamado no link oficial recebido no prompt.',
      'Quando apropriado, ofereca opcao de falar com atendente humano.',
      'Nao invente dados; quando faltar contexto, peca informacao.',
      'Mantenha no maximo 6 linhas e ate 650 caracteres.'
    ].join(' ');
  }

  getMaxReplyChars() {
    const value = Number(process.env.AI_MAX_REPLY_CHARS || 650);
    return Number.isFinite(value) && value > 80 ? value : 650;
  }

  sanitizeReplyText(text) {
    let safe = String(text || '').replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!safe) return '';
    const maxChars = this.getMaxReplyChars();
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
    const chamadoCreateUrl = String(payload?.options?.chamadoCreateUrl || 'https://ajuda.taiksu.com.br/chamados/criar/');
    const context = Array.isArray(payload.context) ? payload.context.slice(-10) : [];
    const contextDocs = Array.isArray(payload.contextDocs) ? payload.contextDocs.slice(0, 5) : [];

    const history = context.map((item, idx) => {
      const role = String(item.role || 'user');
      const content = String(item.content || '');
      return `${idx + 1}. [${role}] ${content}`;
    }).join('\n');

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
      `Mensagem atual: ${message}`,
      `Link oficial para abrir chamado: ${chamadoCreateUrl}`,
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

  async callGemini({ userPrompt, systemInstruction }) {
    const apiKey = this.getGeminiApiKey();
    if (!apiKey) throw new Error('missing_gemini_api_key');

    const model = this.getGeminiModel();
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: 0.35,
            maxOutputTokens: 360
          }
        })
      }
    );

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`gemini_http_${response.status}:${data?.error?.message || 'unknown'}`);
    }

    const reply = this.sanitizeReplyText(this.extractTextFromGeminiResponse(data));
    if (!reply) throw new Error('gemini_empty_reply');

    return {
      provider: 'gemini',
      model,
      reply,
      usage: this.extractUsageFromGemini(data)
    };
  }

  async callOllama({ userPrompt, systemInstruction }) {
    const baseUrl = this.getOllamaBaseUrl();
    const model = this.getOllamaModel();
    const prompt = `${systemInstruction}\n\n${userPrompt}`;

    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: Number(process.env.OLLAMA_TEMPERATURE || 0.2),
          num_predict: Number(process.env.OLLAMA_MAX_TOKENS || 160),
          top_p: Number(process.env.OLLAMA_TOP_P || 0.9),
          repeat_penalty: Number(process.env.OLLAMA_REPEAT_PENALTY || 1.1)
        }
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`ollama_http_${response.status}:${data?.error || 'unknown'}`);
    }

    const reply = this.sanitizeReplyText(this.extractTextFromOllama(data));
    if (!reply) throw new Error('ollama_empty_reply');

    return {
      provider: 'ollama',
      model,
      reply,
      usage: this.extractUsageFromOllama(data)
    };
  }

  async tryProviders({ providers, userPrompt, systemInstruction, roomId, chamadoId, chatState }) {
    const errors = [];

    for (const provider of providers) {
      const startedAt = Date.now();
      try {
        const result = provider === 'ollama'
          ? await this.callOllama({ userPrompt, systemInstruction })
          : await this.callGemini({ userPrompt, systemInstruction });

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

      const providers = this.getProviderOrder();
      const userPrompt = this.buildUserPrompt(payload);
      const systemInstruction = this.buildSystemInstruction();

      const result = await this.tryProviders({
        providers,
        userPrompt,
        systemInstruction,
        roomId,
        chamadoId,
        chatState
      });

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
}

module.exports = new AIController();
