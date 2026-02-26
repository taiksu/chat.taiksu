# Fluxos de Uso

## 1) Fluxo de login SSO (principal)

1. Usuario acessa app protegida sem sessao.
2. Middleware (`requireWebAuth`/`requireApiAuth`) tenta reidratacao.
3. Sem token valido, usuario e redirecionado para `SSO_URL` (web) ou recebe `401` com redirect (API).
4. SSO redireciona para `/callback?token=...`.
5. `SSOController.callback` valida token no endpoint remoto (`SSO_VALIDATE_ENDPOINT`).
6. Usuario local e sincronizado (create/update em `users`).
7. Sessao e token sao persistidos.
8. Usuario vai para `/dashboard`.

## 2) Fluxo de reidratacao de sessao (sem novo login)

Quando a sessao local nao existe, o middleware tenta nesta ordem:

1. `query.token`
2. `session.ssoToken`
3. Cookie `taiksu_sso_token` (ou nome configurado)
4. Header `Authorization: Bearer ...`

Se o token validar, a sessao local e recriada automaticamente.

## 3) Fluxo de abertura de sala web

1. Usuario entra em `/chat/room/:roomId`.
2. Sistema valida existencia da sala.
3. Se usuario nao for participante ativo, adiciona automaticamente.
4. Carrega:
   - participantes
   - ultimas mensagens (ate 100)
   - estado de fechamento da sala
5. Renderiza interface completa da sala.

## 4) Fluxo de envio de mensagem

1. Cliente chama `POST /api/messages/send`.
2. Sistema valida autenticacao e payload.
3. Se recebeu `chamadoId`, cria/resolve sala de chamado automaticamente.
4. Verifica se a sala esta fechada:
   - status de sala/chamado fechado
   - inatividade acima do limite configurado
5. Se houver arquivo, multer grava em disco e gera URL publica.
6. Mensagem e persistida na tabela `messages`.
7. Evento `new_message` e enviado por SSE para clientes da sala.

## 5) Fluxo de leitura de mensagens

1. Cliente chama `POST /api/messages/mark-read` (ou variante com `:roomId`).
2. Sistema marca mensagens de outros usuarios como lidas.
3. Evento `messages_read` e transmitido por SSE.

## 6) Fluxo de digitacao/gravacao

1. Cliente chama `POST /api/messages/typing/:roomId`.
2. Sistema valida autenticacao e estado da sala.
3. Evento `typing_status` e enviado por SSE para outros clientes.

## 7) Fluxo de administracao de sala

Regras:

- Permitido para `owner` da sala ou `role=admin`.
- Operacoes administrativas:
  - limpar mensagens
  - excluir sala
  - remover participante

Cada operacao emite evento SSE especifico para manter interfaces sincronizadas.

## 8) Fluxo da pagina inicial x paginas internas

- Home (`/dashboard`):
  - mostra saudacao do usuario
  - nao mostra breadcrumb no topbar (`showBreadcrumb: false`)
- Demais paginas internas:
  - mostram breadcrumb pelo componente `views/component/breadcrumb/index.ejs`

