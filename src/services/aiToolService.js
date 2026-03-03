const { v4: uuidv4 } = require('uuid');
const { URL } = require('url');
const { sequelize, AiToolModel, AiToolRunModel } = require('../models/sequelize-models');

class AIToolService {
  normalizeMethod(method) {
    const value = String(method || 'POST').trim().toUpperCase();
    const allowed = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
    return allowed.includes(value) ? value : 'POST';
  }

  normalizeSlug(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }

  safeParseJson(raw, fallback) {
    if (raw == null || raw === '') return fallback;
    if (typeof raw === 'object') return raw;
    try {
      return JSON.parse(String(raw));
    } catch (_err) {
      return fallback;
    }
  }

  parseHeaders(input) {
    const parsed = this.safeParseJson(input, {});
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const clean = {};
    Object.keys(parsed).forEach((key) => {
      const header = String(key || '').trim();
      const value = String(parsed[key] ?? '').trim();
      if (!header || !value) return;
      clean[header] = value;
    });
    return clean;
  }

  parseSchema(input) {
    const schema = this.safeParseJson(input, {});
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return {};
    return schema;
  }

  parseAllowedDomains(input) {
    if (Array.isArray(input)) {
      return input.map((d) => String(d || '').trim().toLowerCase()).filter(Boolean);
    }
    return String(input || '')
      .split(/[\n,;]+/g)
      .map((d) => String(d || '').trim().toLowerCase())
      .filter(Boolean);
  }

  flattenArgs(input) {
    const args = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const flat = {};
    Object.keys(args).forEach((key) => {
      const value = args[key];
      if (value == null) {
        flat[key] = '';
      } else if (typeof value === 'object') {
        flat[key] = JSON.stringify(value);
      } else {
        flat[key] = String(value);
      }
    });
    return flat;
  }

  interpolateText(template, args = {}, extra = {}) {
    const source = String(template || '');
    const flat = this.flattenArgs(args);
    return source.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_all, key) => {
      if (Object.prototype.hasOwnProperty.call(extra, key)) return String(extra[key] ?? '');
      if (Object.prototype.hasOwnProperty.call(flat, key)) return String(flat[key] ?? '');
      return '';
    });
  }

  validateArgsWithSchema(args, schema) {
    const parsed = schema && typeof schema === 'object' ? schema : {};
    const properties = parsed.properties && typeof parsed.properties === 'object' ? parsed.properties : {};
    const required = Array.isArray(parsed.required) ? parsed.required.map((k) => String(k)) : [];
    const errors = [];

    required.forEach((key) => {
      if (args[key] === undefined || args[key] === null || args[key] === '') {
        errors.push(`Campo obrigatorio ausente: ${key}`);
      }
    });

    Object.keys(properties).forEach((key) => {
      if (args[key] === undefined || args[key] === null) return;
      const type = String(properties[key]?.type || '').toLowerCase();
      if (!type) return;
      const value = args[key];
      if (type === 'string' && typeof value !== 'string') errors.push(`Campo ${key} deve ser string`);
      if (type === 'number' && typeof value !== 'number') errors.push(`Campo ${key} deve ser number`);
      if (type === 'integer' && !Number.isInteger(value)) errors.push(`Campo ${key} deve ser integer`);
      if (type === 'boolean' && typeof value !== 'boolean') errors.push(`Campo ${key} deve ser boolean`);
      if (type === 'object' && (typeof value !== 'object' || Array.isArray(value))) errors.push(`Campo ${key} deve ser object`);
      if (type === 'array' && !Array.isArray(value)) errors.push(`Campo ${key} deve ser array`);
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }

  toClient(toolRow) {
    const plain = toolRow?.get ? toolRow.get({ plain: true }) : toolRow;
    if (!plain) return null;
    return {
      id: String(plain.id),
      name: String(plain.name || ''),
      slug: String(plain.slug || ''),
      description: String(plain.description || ''),
      enabled: Number(plain.enabled || 0) === 1,
      method: String(plain.method || 'POST'),
      endpointUrl: String(plain.endpoint_url || ''),
      headers: this.safeParseJson(plain.headers_json, {}),
      inputSchema: this.safeParseJson(plain.input_schema_json, {}),
      payloadTemplate: String(plain.payload_template || ''),
      timeoutMs: Number(plain.timeout_ms || 12000),
      allowedDomains: this.safeParseJson(plain.allowed_domains_json, []),
      createdBy: String(plain.created_by || ''),
      createdAt: plain.created_at || null,
      updatedAt: plain.updated_at || null
    };
  }

  async listTools() {
    const rows = await AiToolModel.findAll({ order: [['created_at', 'DESC']] });
    return rows.map((row) => this.toClient(row)).filter(Boolean);
  }

  async getToolById(id) {
    const row = await AiToolModel.findByPk(String(id || ''));
    return this.toClient(row);
  }

  async getToolBySlug(slug) {
    const row = await AiToolModel.findOne({ where: { slug: String(slug || '').trim().toLowerCase() } });
    return this.toClient(row);
  }

  ensureUrlAllowed(endpointUrl, allowedDomains = []) {
    const parsed = new URL(String(endpointUrl || ''));
    const host = String(parsed.hostname || '').toLowerCase();
    if (!host) throw new Error('endpoint_host_invalid');
    if (!Array.isArray(allowedDomains) || !allowedDomains.length) return true;
    const ok = allowedDomains.some((domain) => {
      const item = String(domain || '').toLowerCase();
      return host === item || host.endsWith(`.${item}`);
    });
    if (!ok) throw new Error('endpoint_domain_not_allowed');
    return true;
  }

  async createTool(input = {}, actorId = '') {
    const name = String(input.name || '').trim();
    if (!name) throw new Error('name_obrigatorio');

    const slugSource = String(input.slug || name || '').trim();
    const slug = this.normalizeSlug(slugSource);
    if (!slug) throw new Error('slug_invalido');

    const endpointUrl = String(input.endpointUrl || '').trim();
    if (!endpointUrl) throw new Error('endpoint_url_obrigatoria');
    const method = this.normalizeMethod(input.method);
    const headers = this.parseHeaders(input.headers);
    const inputSchema = this.parseSchema(input.inputSchema);
    const payloadTemplate = String(input.payloadTemplate || '').trim();
    const timeoutMs = Math.max(3000, Math.min(45000, Number(input.timeoutMs || 12000)));
    const allowedDomains = this.parseAllowedDomains(input.allowedDomains);
    this.ensureUrlAllowed(endpointUrl, allowedDomains);

    const created = await AiToolModel.create({
      id: uuidv4(),
      name,
      slug,
      description: String(input.description || '').trim(),
      enabled: input.enabled === undefined ? 1 : (input.enabled ? 1 : 0),
      method,
      endpoint_url: endpointUrl,
      headers_json: JSON.stringify(headers || {}),
      input_schema_json: JSON.stringify(inputSchema || {}),
      payload_template: payloadTemplate,
      timeout_ms: timeoutMs,
      allowed_domains_json: JSON.stringify(allowedDomains || []),
      created_by: String(actorId || '')
    });
    return this.toClient(created);
  }

  async updateTool(id, input = {}) {
    const row = await AiToolModel.findByPk(String(id || ''));
    if (!row) throw new Error('tool_not_found');

    const nextName = input.name !== undefined ? String(input.name || '').trim() : String(row.name || '');
    if (!nextName) throw new Error('name_obrigatorio');

    const nextSlugRaw = input.slug !== undefined ? String(input.slug || '').trim() : String(row.slug || '');
    const nextSlug = this.normalizeSlug(nextSlugRaw || nextName);
    if (!nextSlug) throw new Error('slug_invalido');

    const nextEndpointUrl = input.endpointUrl !== undefined ? String(input.endpointUrl || '').trim() : String(row.endpoint_url || '');
    if (!nextEndpointUrl) throw new Error('endpoint_url_obrigatoria');
    const nextMethod = input.method !== undefined ? this.normalizeMethod(input.method) : String(row.method || 'POST');
    const nextHeaders = input.headers !== undefined ? this.parseHeaders(input.headers) : this.safeParseJson(row.headers_json, {});
    const nextSchema = input.inputSchema !== undefined ? this.parseSchema(input.inputSchema) : this.safeParseJson(row.input_schema_json, {});
    const nextPayloadTemplate = input.payloadTemplate !== undefined ? String(input.payloadTemplate || '').trim() : String(row.payload_template || '');
    const nextTimeoutMs = input.timeoutMs !== undefined
      ? Math.max(3000, Math.min(45000, Number(input.timeoutMs || 12000)))
      : Math.max(3000, Math.min(45000, Number(row.timeout_ms || 12000)));
    const nextAllowedDomains = input.allowedDomains !== undefined
      ? this.parseAllowedDomains(input.allowedDomains)
      : this.safeParseJson(row.allowed_domains_json, []);
    this.ensureUrlAllowed(nextEndpointUrl, nextAllowedDomains);

    await row.update({
      name: nextName,
      slug: nextSlug,
      description: input.description !== undefined ? String(input.description || '').trim() : String(row.description || ''),
      enabled: input.enabled !== undefined ? (input.enabled ? 1 : 0) : row.enabled,
      method: nextMethod,
      endpoint_url: nextEndpointUrl,
      headers_json: JSON.stringify(nextHeaders || {}),
      input_schema_json: JSON.stringify(nextSchema || {}),
      payload_template: nextPayloadTemplate,
      timeout_ms: nextTimeoutMs,
      allowed_domains_json: JSON.stringify(nextAllowedDomains || [])
    });
    return this.toClient(row);
  }

  async deleteTool(id) {
    const toolId = String(id || '').trim();
    if (!toolId) return false;
    const row = await AiToolModel.findByPk(toolId);
    if (!row) return false;

    await sequelize.transaction(async (transaction) => {
      // Limpa historico de execucoes da ferramenta antes de remover o contrato principal
      // para evitar violacao de FK (ai_tool_runs.tool_id -> ai_tools.id).
      await AiToolRunModel.destroy({
        where: { tool_id: toolId },
        transaction
      });
      await row.destroy({ transaction });
    });
    return true;
  }

  buildRequestFromTool(tool, args = {}, extra = {}) {
    const headers = tool.headers && typeof tool.headers === 'object' ? { ...tool.headers } : {};
    const interpolatedHeaders = {};
    Object.keys(headers).forEach((key) => {
      interpolatedHeaders[key] = this.interpolateText(headers[key], args, extra);
    });

    const endpointUrl = this.interpolateText(tool.endpointUrl, args, extra);
    const payloadTemplate = String(tool.payloadTemplate || '').trim();
    let bodyObj = null;
    if (payloadTemplate) {
      const raw = this.interpolateText(payloadTemplate, args, extra);
      const parsed = this.safeParseJson(raw, null);
      bodyObj = parsed && typeof parsed === 'object' ? parsed : { raw };
    } else if (tool.method !== 'GET') {
      bodyObj = args;
    }

    return {
      method: tool.method,
      endpointUrl,
      headers: interpolatedHeaders,
      body: bodyObj
    };
  }

  async saveToolRun(input = {}) {
    const payload = {
      id: uuidv4(),
      tool_id: String(input.toolId || ''),
      room_id: input.roomId ? String(input.roomId) : null,
      actor_id: input.actorId ? String(input.actorId) : null,
      status: String(input.status || 'error'),
      input_json: JSON.stringify(input.toolInput || {}),
      request_json: JSON.stringify(input.requestData || {}),
      response_status: input.responseStatus !== undefined ? Number(input.responseStatus) : null,
      response_body: input.responseBody !== undefined ? JSON.stringify(input.responseBody) : null,
      error_message: input.errorMessage ? String(input.errorMessage) : null,
      latency_ms: input.latencyMs !== undefined ? Number(input.latencyMs) : null
    };

    try {
      return await AiToolRunModel.create(payload);
    } catch (error) {
      const message = String(error?.message || '').toLowerCase();
      if (!/foreign key|constraint/i.test(message)) throw error;
      return AiToolRunModel.create({
        ...payload,
        room_id: null,
        actor_id: null
      });
    }
  }

  async safeSaveToolRun(input = {}) {
    try {
      await this.saveToolRun(input);
    } catch (_err) {
      // Falha de auditoria nao pode quebrar o fluxo de execucao da ferramenta.
    }
  }

  async runTool(tool, args = {}, context = {}) {
    const startedAt = Date.now();
    const validate = this.validateArgsWithSchema(args, tool.inputSchema || {});
    if (!validate.valid) {
      await this.safeSaveToolRun({
        toolId: tool.id,
        roomId: context.roomId,
        actorId: context.actorId,
        status: 'validation_error',
        toolInput: args,
        requestData: {},
        errorMessage: validate.errors.join('; '),
        latencyMs: Date.now() - startedAt
      });
      return {
        success: false,
        error: 'validation_error',
        details: validate.errors
      };
    }

    try {
      const allowedDomains = Array.isArray(tool.allowedDomains) ? tool.allowedDomains : [];
      this.ensureUrlAllowed(tool.endpointUrl, allowedDomains);
      const requestData = this.buildRequestFromTool(tool, args, {
        authToken: String(context.authToken || ''),
        roomId: String(context.roomId || ''),
        actorId: String(context.actorId || ''),
        userId: String(context.userId || '')
      });

      const headers = { ...(requestData.headers || {}) };
      const init = {
        method: requestData.method || 'POST',
        headers
      };
      if (requestData.body !== null && requestData.body !== undefined && init.method !== 'GET') {
        if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(requestData.body);
      }

      const controller = new AbortController();
      const timeout = Math.max(3000, Math.min(45000, Number(tool.timeoutMs || 12000)));
      const timer = setTimeout(() => controller.abort(), timeout);
      init.signal = controller.signal;

      const response = await fetch(requestData.endpointUrl, init);
      clearTimeout(timer);
      const rawText = await response.text();
      const parsedBody = this.safeParseJson(rawText, rawText);

      await this.safeSaveToolRun({
        toolId: tool.id,
        roomId: context.roomId,
        actorId: context.actorId,
        status: response.ok ? 'success' : 'http_error',
        toolInput: args,
        requestData: {
          method: init.method,
          endpointUrl: requestData.endpointUrl,
          headers,
          body: requestData.body
        },
        responseStatus: response.status,
        responseBody: parsedBody,
        latencyMs: Date.now() - startedAt
      });

      if (!response.ok) {
        return {
          success: false,
          error: 'http_error',
          status: response.status,
          data: parsedBody
        };
      }

      return {
        success: true,
        status: response.status,
        data: parsedBody
      };
    } catch (error) {
      await this.safeSaveToolRun({
        toolId: tool.id,
        roomId: context.roomId,
        actorId: context.actorId,
        status: 'exception',
        toolInput: args,
        requestData: {},
        errorMessage: error.message,
        latencyMs: Date.now() - startedAt
      });
      return {
        success: false,
        error: 'exception',
        message: error.message
      };
    }
  }

  async listRuns(toolId, limit = 30) {
    const rows = await AiToolRunModel.findAll({
      where: { tool_id: String(toolId || '') },
      order: [['created_at', 'DESC']],
      limit: Math.min(200, Math.max(1, Number(limit || 30)))
    });
    return rows.map((row) => {
      const plain = row.get({ plain: true });
      return {
        id: String(plain.id),
        toolId: String(plain.tool_id || ''),
        roomId: plain.room_id ? String(plain.room_id) : '',
        actorId: plain.actor_id ? String(plain.actor_id) : '',
        status: String(plain.status || ''),
        input: this.safeParseJson(plain.input_json, {}),
        request: this.safeParseJson(plain.request_json, {}),
        responseStatus: plain.response_status,
        responseBody: this.safeParseJson(plain.response_body, plain.response_body || null),
        errorMessage: String(plain.error_message || ''),
        latencyMs: Number(plain.latency_ms || 0),
        createdAt: plain.created_at
      };
    });
  }
}

module.exports = new AIToolService();
