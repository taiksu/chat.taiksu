# Chat Taiksu

Aplicacao de chat de suporte com interface web, API REST, SSE em tempo real e autenticacao via SSO.

## Stack

- Node.js 22.x
- Express + EJS
- Sequelize (SQLite/MySQL)
- SSE (Server-Sent Events)
- Tailwind + `public/css/style.css`

## Inicio rapido

1. Instale dependencias:
```bash
npm install
```

2. Configure variaveis em `.env` (ou `.env.production`).

3. Rode em desenvolvimento:
```bash
npm run dev
```

4. Build de CSS quando necessario:
```bash
npm run build:css
```

## Scripts

- `npm run dev`: desenvolvimento com nodemon
- `npm start`: execucao normal
- `npm run build:css`: compila Tailwind
- `npm run watch:css`: watch de CSS
- `npm run seed`: seed manual

## Rotas principais

- Web:
  - `/`
  - `/dashboard`
  - `/chat/rooms`
  - `/chat/chamados`

- API:
  - `/api/auth/sso/*`
  - `/api/chat/*`
  - `/api/messages/*`

- Operacao:
  - `/health`

## Documentacao oficial

Toda a documentacao detalhada esta em [`doc/`](c:/apps/chat.taiksu/doc):

- [Indice](c:/apps/chat.taiksu/doc/README.md)
- [Arquitetura](c:/apps/chat.taiksu/doc/ARQUITETURA.md)
- [Rotas e APIs](c:/apps/chat.taiksu/doc/ROTAS_E_APIS.md)
- [Fluxos de Uso](c:/apps/chat.taiksu/doc/FLUXOS_DE_USO.md)
- [Banco de Dados](c:/apps/chat.taiksu/doc/BANCO_DE_DADOS.md)
- [Operacao e Manutencao](c:/apps/chat.taiksu/doc/OPERACAO_E_MANUTENCAO.md)

## Observacoes

- O fluxo principal de autenticacao e SSO.
- `auth/login` e `auth/register` redirecionam para o SSO.
- Para troubleshooting, use primeiro o endpoint `/health`.

