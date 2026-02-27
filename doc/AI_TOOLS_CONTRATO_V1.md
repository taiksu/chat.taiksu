# Contrato de Ferramentas IA (v1)

Este documento define o contrato esperado para ferramentas executadas pelo Chat Taiksu.

## 1) Cadastro da ferramenta (admin)

Tela: `Dashboard > IA > Tools`

Campos principais:

- `name`: nome amigavel
- `slug`: identificador tecnico
- `method`: GET/POST/PUT/PATCH/DELETE
- `endpointUrl`: URL da API da ferramenta
- `headers` (JSON): headers estaticos e com placeholders
- `inputSchema` (JSON Schema simples): contrato de entrada
- `payloadTemplate` (JSON com placeholders `{{campo}}`)
- `allowedDomains`: whitelist de dominios permitidos
- `enabled`: habilitada/desabilitada

## 2) Endpoint de teste (admin)

`POST /api/ai-tools/:id/test`

Body:

```json
{
  "arguments": {
    "chamadoId": "12345",
    "titulo": "Erro no caixa"
  },
  "roomId": "opcional"
}
```

Response:

```json
{
  "success": true,
  "result": {
    "success": true,
    "status": 200,
    "data": {}
  }
}
```

## 3) Endpoint de execucao interna por slug

`POST /api/ai-tools/execute/:slug`

Autenticacao:

- Header `x-ai-token` deve ser igual ao `API_AI_TOKEN` (quando configurado).

Body:

```json
{
  "arguments": {
    "chamadoId": "12345"
  },
  "roomId": "opcional",
  "actorId": "opcional",
  "userId": "opcional",
  "authToken": "opcional"
}
```

Response:

```json
{
  "success": true,
  "tool": {
    "id": "uuid",
    "slug": "abrir-chamado",
    "name": "Abrir chamado"
  },
  "result": {
    "success": true,
    "status": 200,
    "data": {}
  }
}
```

## 4) Placeholders suportados em template

No `payloadTemplate` e `headers`:

- `{{campo}}` vindo de `arguments.campo`
- `{{authToken}}`, `{{roomId}}`, `{{actorId}}`, `{{userId}}` vindos do contexto de execucao

Exemplo de payload template:

```json
{
  "chamado_id": "{{chamadoId}}",
  "titulo": "{{titulo}}",
  "descricao": "{{descricao}}",
  "origem": "chat-taiksu"
}
```

## 5) Regras de seguranca

- Dominios fora da whitelist sao bloqueados.
- Ferramenta desabilitada nao executa.
- Input validado pelo `inputSchema` (required + tipos basicos).
- Toda execucao gera log em `ai_tool_runs`.
