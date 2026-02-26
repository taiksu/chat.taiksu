# Arquitetura da Aplicacao

## Visao geral

Aplicacao Node.js + Express com:

- Renderizacao server-side em EJS para interface web
- APIs REST para operacoes de chat
- SSE (Server-Sent Events) para tempo real
- Persistencia em Sequelize (SQLite ou MySQL)
- Autenticacao principal via SSO

## Stack tecnica

- Runtime: Node.js 22.x
- Servidor: Express 4
- Views: EJS
- ORM: Sequelize 6
- Banco: SQLite (default) ou MySQL
- Sessao: express-session (MemoryStore ou express-mysql-session)
- Upload: multer
- Tempo real: SSE em memoria (`global.sseClients`)
- CSS: Tailwind compilado + `public/css/style.css`

## Estrutura de pastas (fonte)

`src/server.js`
- Bootstrap da app
- Middleware global
- Registro de rotas
- Inicializacao de banco e migracao seed

`src/routes/*`
- Define endpoints e conecta controllers

`src/controllers/*`
- Regras de negocio HTTP
- Render de views e respostas JSON

`src/models/*`
- Acesso a dados
- Regras de persistencia (usuarios, salas, mensagens, participantes)

`src/middleware/*`
- Validacao de token SSO
- Reidratacao de sessao para web e API

`src/views/*`
- Interfaces EJS por modulo (`auth`, `dashboard`, `chat`, `partials`, `component`)

## Ciclo de inicializacao

1. Carrega `.env.production` quando `NODE_ENV=production`; senao `.env`
2. Configura CORS, body parser e arquivos estaticos
3. Configura sessao (cookie e store opcional em MySQL)
4. Registra rotas
5. Executa:
   - `syncDatabase()`
   - `runMigrations()` (seed inicial uma vez)
6. Sobe listener HTTP (`HOST` + `PORT`)

Se o bootstrap falhar:
- Em development: app sobe e exibe erro detalhado na raiz
- Em production: app responde pagina 503
- `/health` expone o estado (`ok` + `startupError`)

## Autenticacao e sessao

Fluxo principal:

1. Usuario vem do SSO para `/callback?token=...`
2. Token e validado no servidor SSO
3. Usuario local e sincronizado (cria/atualiza)
4. Sessao local e criada (`req.session.user`)
5. Cookie do token SSO e salvo (`taiksu_sso_token` por padrao)

Protecao de rotas:

- Web: `requireWebAuth`
- API: `requireApiAuth`

Ambos tentam reidratacao de sessao usando:

1. `req.query.token`
2. `req.session.ssoToken`
3. Cookie de token SSO
4. `Authorization: Bearer ...`

## Tempo real (SSE)

Endpoint:
- `GET /api/messages/stream/:roomId`

Conexao:
- Cada sala mantem lista de conexoes em `global.sseClients[roomId]`
- Eventos sao enviados com `res.write("data: ...\\n\\n")`
- Conexao removida ao fechar request

Eventos emitidos atualmente:

- `new_message`
- `messages_read`
- `typing_status`
- `message_deleted`
- `room_cleared`
- `room_deleted`
- `participant_removed`

## Fechamento automatico de chats de chamado

Para salas `support_ticket`:

- Se status da sala/chamado estiver fechado, bloqueia envio
- Se tempo sem atividade exceder `CHAMADO_INACTIVITY_HOURS`, bloqueia envio
- APIs retornam `409` com `code: "chat_closed"`

