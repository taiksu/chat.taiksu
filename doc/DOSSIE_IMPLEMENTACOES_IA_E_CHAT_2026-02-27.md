# Dossie de Implementacoes IA e Chat (2026-02-27)

Este documento consolida as entregas implementadas na fase de evolucao do chat com IA, operacao admin e protecao de dados persistentes.

## 1) Interface e experiencia do chat

- Padronizacao de layout principal pos-login com includes de `partials/header`, `partials/menu` e `partials/footer`.
- Ajustes visuais no widget e no painel admin para separar melhor mensagens enviadas e recebidas.
- Troca e padronizacao de botoes para componentes oficiais do projeto.
- Melhorias em cards e tabelas de salas/chamados com pesquisa e filtro de data.
- Ajustes de alinhamento/espacamento em tabelas e dropdown de status de sala.
- Inclusao de indicador de processamento da IA (typing/processing via SSE).
- Remocao de acao de "Ver chamado" dentro da resposta da IA para manter fluxo no proprio chat.

## 2) Fluxo de estado do atendimento

Estados adotados no fluxo:

- `NEW -> IA -> AGUARDANDO_HUMANO -> FILA -> HUMANO -> FECHADO`

Entregas relacionadas:

- Rota para mudanca de status de chamados/salas.
- Bloqueio por inatividade e status de chat fechado.
- Encaminhamento para humano quando ha falha de modelo/provedor.
- Notificacao de eventos de escalonamento para administracao.

## 3) IA de primeiro contato

- Integracao de API de IA para primeiro contato (`/api/ai/first-contact`).
- Estrategia de provedores com ordem configuravel:
  - `AI_PROVIDER_ORDER=ollama`.
- Fallback automatico:
  - Falha no provedor primario -> tenta secundario.
  - Falha geral -> encaminha para humano.
- Suporte a Ollama remoto com token:
  - `OLLAMA_BASE_URL`
  - `OLLAMA_MODEL`
  - `OLLAMA_API_TOKEN`
  - `OLLAMA_AUTH_MODE`
- Metricas estruturadas no log (`[AI_METRIC]`) com:
  - latencia
  - provider/model
  - tokens
  - kb hits

## 4) Memoria curta por sala (short-term memory)

- Implementacao de memoria em cache por `roomId` no `MessageController`.
- Campos principais:
  - `topic`
  - `intent`
  - `summary`
  - `lastUserMessage`
  - `lastAiMessage`
  - `updatedAt`
- TTL configuravel por ambiente:
  - `AI_MEMORY_TTL_MINUTES`
- Expansao contextual para mensagens curtas (`sim`, `nao`, `ok`, etc.).
- Limpeza automatica por expirar TTL.

## 5) Debug admin de memoria por sala

Entregas:

- Controller: `src/controllers/MemoryDebugController.js`
- Rotas:
  - `GET /dashboard/memory-debug`
  - `GET /dashboard/memory-debug/data`
  - `POST /dashboard/memory-debug/clear-room/:roomId`
  - `POST /dashboard/memory-debug/clear-all`
- Tela admin:
  - busca por sala/topico/intencao
  - listagem de memorias ativas
  - limpar sala
  - limpar tudo
- Menu lateral:
  - item "Memoria IA"

## 6) RAG simples e base de conhecimento

- Evolucao da base para fluxo de `draft/live`.
- Importacao automatica via Markdown (`.md`).
- Publicacao e versionamento de conhecimento.
- Historico de importacoes.
- Edicao de itens de conhecimento e restauracao de versoes.
- Tela administrativa da base IA com fluxo de manutencao.

## 7) Feedback de resposta da IA

- Feedback por mensagem (`up/down`).
- Tela de insights com top respostas e sugestao para base IA.
- Ajuste de usabilidade:
  - apos enviar sugestao, marcar como enviado e bloquear duplicidade.

## 8) Configuracoes administrativas de IA

Configuracoes expostas via painel:

- ligar/desligar modo IA atendente
- modo beta com allowlist de usuarios
- nome/foto da assistente
- prompt de personalidade
- temperatura
- max tokens
- max chars
- teste de prompt no painel

Padrao inicial revisado para reduzir repeticao e verbosidade:

- `temperature`: 0.25
- `maxOutputTokens`: 280
- `maxReplyChars`: 420

## 9) Melhorias de comportamento conversacional

Problemas atacados:

- repeticao de saudacao
- repeticao da mesma resposta
- insistencia no topico antigo

Correcoes aplicadas:

- prompt com regra forte de nao repeticao.
- pos-processamento para remover saudacao recorrente.
- deteccao de resposta muito parecida com a anterior.
- deteccao de troca de assunto (topic shift) e reset de pendencias.
- reorientacao de resposta quando IA responde tema divergente do pedido atual.

## 10) Persistencia e protecao de dados em deploy

Contexto:

- Em deploy com sobrescrita de codigo, dados em `src/` podem ser perdidos.

Medidas adotadas:

- Uploads fora da pasta de codigo:
  - `FILES_DIR=/home/.../storage/uploads`
- Dados de configuracao e conhecimento fora da pasta de codigo:
  - `DATA_DIR=/home/.../storage/appdata`

Servicos ajustados para usar `DATA_DIR`:

- `settingsService` (`app-settings.json`)
- `knowledgeAdminService` (`knowledge.json`, draft, versions, history)
- `knowledgeBase` (leitura da base live)

## 11) Seguranca Ollama remoto

- Protecao de acesso por token no reverse proxy.
- Restricao de endpoints permitidos.
- Validacao por `Authorization: Bearer`.
- Integracao no app com `OLLAMA_API_TOKEN`.

## 12) Pendencias recomendadas para proxima fase

- Implementar function calling controlado no backend:
  - `abrir_chamado`
  - `consultar_status_chamado`
- Refinar RAG por dominio (auditoria, caixa, visao geral etc.).
- Criar pipeline de curadoria automatica de conhecimento com aprovacao humana.
- Criar dashboard comparativo de qualidade por provider/modelo.

## 13) Checklist de encerramento da fase

- [x] Fluxo IA primeiro contato funcional.
- [x] Escalonamento para humano funcional.
- [x] Feedback de respostas funcional.
- [x] Base de conhecimento com importacao e versoes.
- [x] Memoria curta por sala funcional.
- [x] Debug admin de memoria funcional.
- [x] Persistencia com `FILES_DIR` e `DATA_DIR`.
- [x] Ollama remoto protegido por token.
