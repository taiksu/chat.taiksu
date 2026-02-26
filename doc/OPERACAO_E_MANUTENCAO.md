# Operacao e Manutencao

## Scripts principais

- `npm run dev`: sobe servidor com nodemon
- `npm start`: sobe servidor normal
- `npm run build:css`: compila Tailwind para `public/css/tailwind.css`
- `npm run watch:css`: watch de CSS em desenvolvimento
- `npm run seed`: executa seed manual (`src/seed.js`)

## Variaveis de ambiente importantes

## Runtime e rede

- `NODE_ENV`: `development` ou `production`
- `HOST`: host de bind (default `0.0.0.0`)
- `PORT`: porta HTTP (default `3000`)
- `APP_URL`: URL publica da app (usada em telas/labs)
- `PROXY_TRUST`: ativa `trust proxy` no Express
- `CORS_ORIGIN`: lista de origens separadas por virgula

## Arquivos estaticos e uploads

- `PUBLIC_DIR`: diretorio raiz de assets estaticos
- `FILES_DIR`: diretorio fisico de uploads
- `MAX_FILE_SIZE`: limite de upload em bytes (default `52428800`)

## Sessao

- `SESSION_SECRET`: segredo de sessao
- `SESSION_COOKIE_NAME`: nome do cookie de sessao
- `SESSION_COOKIE_SECURE`: `true/false`
- `SESSION_COOKIE_SAMESITE`: default `lax`
- `SESSION_COOKIE_DOMAIN`: dominio de cookie
- `SESSION_TABLE_NAME`: nome da tabela de sessao quando MySQL store estiver ativo

## SSO

- `SSO_URL`: URL base do provedor SSO e alvo de redirecionamento
- `SSO_VALIDATE_ENDPOINT`: endpoint de validacao do token
- `SSO_TIMEOUT`: timeout da chamada de validacao (ms)
- `SSO_TOKEN_COOKIE_NAME`: nome do cookie com token SSO

## Banco

- `DB_TYPE`: `sqlite` ou `mysql`
- `DB_PATH`: caminho SQLite (quando `DB_TYPE=sqlite`)
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`: MySQL

## Comportamento de bootstrap e operacao

- `STRICT_STARTUP=true`: encerra processo se bootstrap falhar
- `ALLOW_DEV_LOGIN=true`: habilita `/auth/dev-login` em producao
- `CHAMADO_INACTIVITY_HOURS`: horas para fechamento automatico de chat de chamado

## Runbook de diagnostico rapido

1. Verificar health:
   - `GET /health`
2. Verificar logs de startup:
   - erro de DB/sync/migration
3. Verificar sessao:
   - cookie de sessao presente
   - cookie/token SSO valido
4. Verificar uploads:
   - permissao de escrita em `FILES_DIR`
5. Verificar SSE:
   - cliente conectado em `/api/messages/stream/:roomId`

## Checklist para evolucao segura

1. Rotas novas:
   - definir controller
   - aplicar middleware de auth correto (`web` ou `api`)
   - documentar em `ROTAS_E_APIS.md`
2. Mudanca de fluxo:
   - atualizar `FLUXOS_DE_USO.md`
3. Mudanca de schema:
   - ajustar Sequelize models
   - validar sync/migration
   - atualizar `BANCO_DE_DADOS.md`
4. Mudanca de variavel:
   - registrar aqui com default e impacto
5. Mudanca de UI navegacional:
   - validar topbar, breadcrumb e links entre telas

## Divida tecnica atual para planejar

- Nao ha suite automatizada de testes de backend
- SSE em memoria local (sem broker compartilhado)
- Parte do README raiz ainda esta desatualizada em relacao ao fluxo SSO-only

