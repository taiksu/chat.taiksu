const aiToolService = require('../services/aiToolService');
const YAML = require('yaml');

class AIToolsController {
  isAdmin(req) {
    return String(req.session?.user?.role || '').toLowerCase() === 'admin';
  }

  denyPage(req, res) {
    return res.status(403).render('error', {
      title: 'Acesso negado',
      message: 'Apenas administradores podem acessar Ferramentas IA',
      user: req.session.user
    });
  }

  denyApi(res) {
    return res.status(403).json({ error: 'Acesso restrito para admin' });
  }

  async page(req, res) {
    if (!this.isAdmin(req)) return this.denyPage(req, res);
    return res.render('dashboard/ai-tools', {
      title: 'Ferramentas IA - Chat Taiksu',
      user: req.session.user,
      activeNav: 'ai',
      aiTab: 'tools'
    });
  }

  parseSpec(raw) {
    const input = String(raw || '').trim();
    if (!input) throw new Error('spec_vazia');
    try {
      if (input.startsWith('{') || input.startsWith('[')) return JSON.parse(input);
      return YAML.parse(input);
    } catch (_err) {
      throw new Error('spec_invalida_yaml_json');
    }
  }

  resolveRef(spec, ref) {
    const value = String(ref || '').trim();
    if (!value.startsWith('#/')) return null;
    const parts = value.slice(2).split('/').map((item) => item.replace(/~1/g, '/').replace(/~0/g, '~'));
    let node = spec;
    for (const key of parts) {
      if (!node || typeof node !== 'object' || !(key in node)) return null;
      node = node[key];
    }
    return node && typeof node === 'object' ? node : null;
  }

  resolveSchema(spec, schema) {
    if (!schema || typeof schema !== 'object') return {};
    if (schema.$ref) {
      const resolved = this.resolveRef(spec, schema.$ref);
      if (!resolved) return {};
      return this.resolveSchema(spec, resolved);
    }
    return schema;
  }

  buildTemplateFromSchema(spec, schema, keyName = 'valor') {
    const resolved = this.resolveSchema(spec, schema);
    const type = String(resolved?.type || '').toLowerCase();
    const props = resolved?.properties && typeof resolved.properties === 'object' ? resolved.properties : {};
    if (type === 'object' || Object.keys(props).length) {
      const out = {};
      Object.keys(props).forEach((key) => {
        out[key] = this.buildTemplateFromSchema(spec, props[key], key);
      });
      return out;
    }
    if (type === 'array') {
      const sampleItem = this.buildTemplateFromSchema(spec, resolved.items || {}, keyName);
      return [sampleItem];
    }
    if (type === 'integer' || type === 'number') return 0;
    if (type === 'boolean') return false;
    const enumValues = Array.isArray(resolved?.enum) ? resolved.enum : [];
    if (enumValues.length) return String(enumValues[0]);
    const placeholder = String(resolved?.title || keyName || 'valor')
      .trim()
      .replace(/[^a-zA-Z0-9_.-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase() || 'valor';
    return `{{${placeholder}}}`;
  }

  buildInputSchemaFromRequest(spec, schema) {
    const resolved = this.resolveSchema(spec, schema);
    const type = String(resolved?.type || '').toLowerCase();
    if (type !== 'object') {
      return { type: 'object', required: [], properties: {} };
    }
    const required = Array.isArray(resolved.required) ? resolved.required.map((item) => String(item)) : [];
    const properties = resolved?.properties && typeof resolved.properties === 'object' ? resolved.properties : {};
    const outProps = {};
    Object.keys(properties).forEach((key) => {
      const node = this.resolveSchema(spec, properties[key]);
      const propType = String(node?.type || '').toLowerCase();
      const result = {};
      if (propType) result.type = propType;
      if (Array.isArray(node?.enum) && node.enum.length) result.enum = node.enum;
      outProps[key] = Object.keys(result).length ? result : { type: 'string' };
    });
    return {
      type: 'object',
      required,
      properties: outProps
    };
  }

  importFromOpenApi(rawSpec = '') {
    const spec = this.parseSpec(rawSpec);
    const paths = spec?.paths && typeof spec.paths === 'object' ? spec.paths : {};
    const servers = Array.isArray(spec?.servers) ? spec.servers : [];
    const baseUrl = String(servers[0]?.url || '').trim();
    const entries = Object.keys(paths);
    if (!entries.length) throw new Error('openapi_sem_paths');

    const methodsPriority = ['post', 'put', 'patch', 'get', 'delete'];
    let pickedPath = '';
    let pickedMethod = '';
    let operation = null;
    for (const pathKey of entries) {
      const item = paths[pathKey] || {};
      for (const method of methodsPriority) {
        if (item[method]) {
          pickedPath = pathKey;
          pickedMethod = method.toUpperCase();
          operation = item[method];
          break;
        }
      }
      if (operation) break;
    }
    if (!operation) throw new Error('openapi_sem_operacao_http');

    const opId = String(operation.operationId || '').trim();
    const name = String(operation.summary || opId || `${pickedMethod} ${pickedPath}`).trim();
    const slugSource = (opId || '')
      ? String(opId).replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      : name;
    const slug = aiToolService.normalizeSlug(slugSource || 'tool-openapi');
    const description = String(operation.description || operation.summary || '').trim();
    const endpointUrl = `${baseUrl.replace(/\/+$/, '')}${pickedPath}`;
    const allowedDomain = (() => {
      try {
        return new URL(endpointUrl).hostname;
      } catch (_err) {
        return '';
      }
    })();

    const opParameters = Array.isArray(operation.parameters) ? operation.parameters : [];
    const rootParameters = Array.isArray(paths[pickedPath]?.parameters) ? paths[pickedPath].parameters : [];
    const headers = { 'Content-Type': 'application/json' };

    const allParams = [...rootParameters, ...opParameters];
    allParams.forEach((param) => {
      const resolved = param?.$ref ? this.resolveRef(spec, param.$ref) : param;
      if (!resolved || String(resolved.in || '').toLowerCase() !== 'header') return;
      const headerName = String(resolved.name || '').trim();
      if (!headerName) return;
      if (/^idempotency-key$/i.test(headerName)) {
        headers[headerName] = '{{idempotencyKey}}';
      } else {
        headers[headerName] = `{{${headerName.replace(/[^a-zA-Z0-9]+/g, '')}}}`;
      }
    });

    const security = Array.isArray(operation.security) ? operation.security : [];
    if (security.length) headers.Authorization = 'Bearer {{authToken}}';

    const requestSchema = operation?.requestBody?.content?.['application/json']?.schema || {};
    const inputSchema = this.buildInputSchemaFromRequest(spec, requestSchema);
    const payloadTemplateObj = this.buildTemplateFromSchema(spec, requestSchema);

    const required = Array.isArray(inputSchema.required) ? inputSchema.required : [];
    const testArgs = {};
    required.forEach((key) => {
      testArgs[key] = `{{${key}}}`;
    });

    return {
      name,
      slug,
      description,
      method: pickedMethod,
      timeoutMs: 12000,
      endpointUrl,
      allowedDomains: allowedDomain ? [allowedDomain] : [],
      headers,
      inputSchema,
      payloadTemplate: payloadTemplateObj && typeof payloadTemplateObj === 'object' ? payloadTemplateObj : {},
      testArgs,
      meta: {
        pickedPath,
        pickedMethod,
        operationId: opId || '',
        source: spec?.openapi ? `openapi_${spec.openapi}` : 'openapi'
      }
    };
  }

  async list(req, res) {
    if (!this.isAdmin(req)) return this.denyApi(res);
    const items = await aiToolService.listTools();
    return res.json({ success: true, items });
  }

  async create(req, res) {
    if (!this.isAdmin(req)) return this.denyApi(res);
    try {
      const created = await aiToolService.createTool(req.body || {}, req.session?.user?.id || '');
      return res.json({ success: true, item: created });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  async update(req, res) {
    if (!this.isAdmin(req)) return this.denyApi(res);
    try {
      const updated = await aiToolService.updateTool(req.params?.id, req.body || {});
      return res.json({ success: true, item: updated });
    } catch (error) {
      if (error.message === 'tool_not_found') return res.status(404).json({ error: 'Ferramenta nao encontrada' });
      return res.status(400).json({ error: error.message });
    }
  }

  async remove(req, res) {
    if (!this.isAdmin(req)) return this.denyApi(res);
    try {
      const removed = await aiToolService.deleteTool(req.params?.id);
      return res.json({ success: true, removed });
    } catch (error) {
      const message = String(error?.message || 'Falha ao excluir ferramenta');
      if (/foreign key|constraint/i.test(message)) {
        return res.status(409).json({
          error: 'Nao foi possivel excluir: existem execucoes vinculadas a esta ferramenta.'
        });
      }
      return res.status(400).json({ error: message });
    }
  }

  async listRuns(req, res) {
    if (!this.isAdmin(req)) return this.denyApi(res);
    try {
      const runs = await aiToolService.listRuns(req.params?.id, req.query?.limit || 30);
      return res.json({ success: true, items: runs });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  async test(req, res) {
    if (!this.isAdmin(req)) return this.denyApi(res);
    try {
      const tool = await aiToolService.getToolById(req.params?.id);
      if (!tool) return res.status(404).json({ error: 'Ferramenta nao encontrada' });
      if (!tool.enabled) return res.status(400).json({ error: 'Ferramenta desativada' });

      const args = req.body?.arguments && typeof req.body.arguments === 'object' ? req.body.arguments : {};
      const result = await aiToolService.runTool(tool, args, {
        actorId: req.session?.user?.id || '',
        userId: req.session?.user?.id || '',
        authToken: req.session?.ssoToken || '',
        roomId: String(req.body?.roomId || '').trim()
      });
      return res.json({ success: true, result });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  async importOpenApi(req, res) {
    if (!this.isAdmin(req)) return this.denyApi(res);
    try {
      const rawSpec = String(req.body?.spec || '').trim();
      const imported = this.importFromOpenApi(rawSpec);
      return res.json({ success: true, item: imported });
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Falha ao importar OpenAPI' });
    }
  }

  async executeBySlug(req, res) {
    try {
      const internal = String(process.env.API_AI_TOKEN || '').trim();
      const sent = String(req.headers['x-ai-token'] || '').trim();
      if (internal && sent !== internal) {
        return res.status(401).json({ error: 'Nao autorizado' });
      }
      const slug = String(req.params?.slug || '').trim();
      const tool = await aiToolService.getToolBySlug(slug);
      if (!tool) return res.status(404).json({ error: 'Ferramenta nao encontrada' });
      if (!tool.enabled) return res.status(400).json({ error: 'Ferramenta desativada' });
      const args = req.body?.arguments && typeof req.body.arguments === 'object' ? req.body.arguments : {};
      const result = await aiToolService.runTool(tool, args, {
        actorId: String(req.body?.actorId || ''),
        userId: String(req.body?.userId || ''),
        authToken: String(req.body?.authToken || ''),
        roomId: String(req.body?.roomId || '')
      });
      return res.json({ success: true, tool: { id: tool.id, slug: tool.slug, name: tool.name }, result });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }
}

module.exports = new AIToolsController();
