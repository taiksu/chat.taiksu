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

  getApiKey() {
    return String(process.env.GEMINI_API_KEY || '').trim();
  }

  getModel() {
    return String(process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();
  }

  getInternalToken() {
    return String(process.env.API_AI_TOKEN || '').trim();
  }

  isAuthorized(req) {
    const required = this.getInternalToken();
    if (!required) return true;
    const sent = String(req.headers['x-ai-token'] || '').trim();
    return sent && sent === required;
  }

  buildSystemInstruction() {
    return [
      'Você é a Assistente Marina da Taiksu IA para primeiro atendimento.',
      'Responda sempre em português do Brasil.',
      'Seja objetiva, clara e útil.',
      'Cumprimente apenas na primeira interação da conversa; depois responda direto ao ponto.',
      'Quando houver base de conhecimento enviada, use essa base como fonte principal.',
      'Se a resposta não estiver na base enviada, diga que precisa de mais informações ou ofereça humano.',
      'Se o usuário pedir tutorial e não houver base suficiente, indique abrir chamado no link oficial recebido no prompt.',
      'Quando apropriado, ofereça opção de falar com atendente humano.',
      'Não invente dados; quando faltar contexto, peça informação.',
      'Mantenha no máximo 6 linhas.'
    ].join(' ');
  }

  buildUserPrompt(payload) {
    const roomId = String(payload.roomId || '');
    const chamadoId = payload.chamadoId ? String(payload.chamadoId) : '';
    const chatState = String(payload.chatState || 'IA');
    const userName = String(payload?.user?.name || 'Usuário');
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
        const title = String(doc?.title || 'Sem título');
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
      `Usuário: ${userName}`,
      `Mensagem atual: ${message}`,
      `Link oficial para abrir chamado: ${chamadoCreateUrl}`,
      docsBlock ? `Base de conhecimento recuperada:\n${docsBlock}` : 'Sem base de conhecimento recuperada.',
      history ? `Contexto recente:\n${history}` : 'Sem contexto prévio.'
    ].join('\n\n');
  }

  extractTextFromGeminiResponse(data) {
    const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
    if (!candidates.length) return '';

    const parts = Array.isArray(candidates[0]?.content?.parts)
      ? candidates[0].content.parts
      : [];
    const text = parts
      .map((part) => String(part?.text || '').trim())
      .filter(Boolean)
      .join('\n')
      .trim();

    return text;
  }

  extractUsage(data) {
    const usage = data?.usageMetadata || {};
    return {
      promptTokens: Number(usage.promptTokenCount || 0),
      completionTokens: Number(usage.candidatesTokenCount || 0),
      totalTokens: Number(usage.totalTokenCount || 0)
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

      const apiKey = this.getApiKey();
      if (!apiKey) {
        this.logAiMetric('missing_api_key', { roomId, chamadoId, chatState });
        return res.status(503).json({ error: 'GEMINI_API_KEY nao configurada' });
      }

      const model = this.getModel();
      const userPrompt = this.buildUserPrompt(payload);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: this.buildSystemInstruction() }]
            },
            contents: [
              {
                role: 'user',
                parts: [{ text: userPrompt }]
              }
            ],
            generationConfig: {
              temperature: 0.4,
              maxOutputTokens: 360
            }
          })
        }
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        this.logAiMetric('gemini_http_error', {
          roomId,
          chamadoId,
          chatState,
          model,
          httpStatus: response.status,
          latencyMs: Date.now() - startedAt
        });
        return res.status(502).json({
          error: 'Falha ao consultar Gemini',
          status: response.status,
          detail: data?.error?.message || null
        });
      }

      const reply = this.extractTextFromGeminiResponse(data);
      if (!reply) {
        this.logAiMetric('empty_reply', {
          roomId,
          chamadoId,
          chatState,
          model,
          latencyMs: Date.now() - startedAt
        });
        return res.status(502).json({ error: 'Gemini retornou resposta vazia' });
      }

      const usage = this.extractUsage(data);
      const latencyMs = Date.now() - startedAt;
      this.logAiMetric('success', {
        roomId,
        chamadoId,
        chatState,
        model,
        latencyMs,
        inputChars,
        outputChars: reply.length,
        usage
      });

      return res.json({
        success: true,
        model,
        reply,
        usage,
        latencyMs
      });
    } catch (error) {
      this.logAiMetric('exception', {
        latencyMs: Date.now() - startedAt,
        error: error.message
      });
      return res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new AIController();
