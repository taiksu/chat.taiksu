# Rotas e APIs

## Mapa rapido por prefixo

- Web publica: `/`
- Autenticacao: `/auth/*`
- Dashboard: `/dashboard/*`
- Chat web: `/chat/*`
- API de chat: `/api/chat/*`
- API de mensagens: `/api/messages/*`
- API SSO: `/api/auth/sso/*`
- Callback SSO: `/callback`
- Healthcheck: `/health`

## Rotas web

### Base

| Metodo | Rota | Auth | Descricao |
|---|---|---|---|
| GET | `/` | Nao | Home publica. Redireciona para `/dashboard` se houver sessao. |
| GET | `/health` | Nao | Estado da aplicacao e bootstrap. |

### Auth (`src/routes/auth.js`)

| Metodo | Rota | Auth | Descricao |
|---|---|---|---|
| GET | `/auth/login` | Nao | Redireciona para `SSO_URL`. |
| GET | `/auth/register` | Nao | Redireciona para `SSO_URL`. |
| POST | `/auth/register` | Nao | Redireciona para `SSO_URL`. |
| POST | `/auth/login` | Nao | Redireciona para `SSO_URL`. |
| GET | `/auth/logout` | Sim (se existir) | Encerra sessao local e limpa cookie de token. |
| GET | `/auth/dev-login` | Nao | Login tecnico (ambiente de dev, ou prod com `ALLOW_DEV_LOGIN=true`). |
| GET | `/auth/dev-login/:userId` | Nao | Login tecnico para perfil especifico. |

### Dashboard (`src/routes/dashboard.js`)

| Metodo | Rota | Auth | Descricao |
|---|---|---|---|
| GET | `/dashboard` | `requireWebAuth` | Tela principal e cards de metricas. |
| GET | `/dashboard/metrics` | `requireWebAuth` | JSON com metricas dos ultimos 30 dias. |
| GET | `/dashboard/qa-chat` | `requireWebAuth` | Laboratorio de QA das salas/chamados. |
| GET | `/dashboard/template-lab` | `requireWebAuth` | Laboratorio de templates para mensagens. |

### Chat web (`src/routes/chat.js`)

| Metodo | Rota | Auth | Descricao |
|---|---|---|---|
| GET | `/chat/rooms` | `requireWebAuth` | Lista salas comuns (nao chamado). |
| GET | `/chat/chamados` | `requireWebAuth` | Lista salas vinculadas a chamado. |
| GET | `/chat/room/:roomId` | `requireWebAuth` | Abre sala e carrega mensagens/participantes. |
| POST | `/chat/create-room` | `requireWebAuth` | Cria sala comum com owner atual. |

## APIs REST

### SSO (`src/routes/sso.js`)

| Metodo | Rota | Auth | Descricao |
|---|---|---|---|
| POST | `/api/auth/sso/validate` | Header Bearer opcional + middleware SSO | Valida token e cria sessao local. |
| GET | `/api/auth/sso/me` | Sessao | Retorna usuario autenticado e dados SSO. |
| POST | `/api/auth/sso/logout` | Sessao | Logout da sessao local. |
| GET | `/callback?token=...` | Token via query | Callback principal do SSO; cria sessao e redireciona para `/dashboard`. |

### Chat API (`src/routes/chat-api.js`)

| Metodo | Rota | Auth | Descricao |
|---|---|---|---|
| GET | `/api/chat/chamados/rooms` | `requireApiAuth` | Lista salas de chamado em JSON. |
| POST | `/api/chat/chamados/:chamadoId/room` | `requireApiAuth` | Cria ou retorna sala de chamado (idempotente). |
| DELETE | `/api/chat/rooms/:roomId/messages` | `requireApiAuth` | Limpa mensagens da sala (somente admin/owner). |
| DELETE | `/api/chat/rooms/:roomId` | `requireApiAuth` | Exclui sala e dependencias (somente admin/owner). |
| DELETE | `/api/chat/rooms/:roomId/participants/:userId` | `requireApiAuth` | Remove participante ativo (somente admin/owner). |

### Mensagens (`src/routes/messages.js`)

| Metodo | Rota | Auth | Descricao |
|---|---|---|---|
| POST | `/api/messages/send` | `requireApiAuth` | Envia texto/arquivo. Pode criar sala de chamado automaticamente. |
| POST | `/api/messages/mark-read` | `requireApiAuth` | Marca mensagem ou sala inteira como lida. |
| POST | `/api/messages/mark-read/:roomId` | `requireApiAuth` | Marca sala inteira como lida. |
| DELETE | `/api/messages/:messageId` | `requireApiAuth` | Exclui mensagem propria. |
| GET | `/api/messages/room-state/:roomId` | `requireApiAuth` | Retorna estado de fechamento da sala. |
| GET | `/api/messages/:roomId` | `requireApiAuth` | Lista mensagens (query `limit`). |
| GET | `/api/messages/stream/:roomId` | `requireApiAuth` | Canal SSE da sala. |
| POST | `/api/messages/typing/:roomId` | `requireApiAuth` | Atualiza status de digitacao/gravacao. |

## Codigos de resposta relevantes

- `200/201`: operacao OK
- `400`: payload invalido (ex.: id obrigatorio ausente)
- `401`: nao autenticado
- `403`: autenticado sem permissao
- `404`: recurso nao encontrado
- `409`: chat fechado para novas mensagens
- `500`: erro interno

