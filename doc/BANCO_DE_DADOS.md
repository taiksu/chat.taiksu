# Banco de Dados

## Tecnologias suportadas

- SQLite (padrao de desenvolvimento)
- MySQL (recomendado para producao)

A selecao e feita por `DB_TYPE`.

## Tabelas principais

## `users`

Campos chave:
- `id` (PK string)
- `name`
- `email` (unico)
- `password` (nullable em fluxo SSO)
- `avatar`
- `status` (`online`/`offline`)
- `role` (`user`, `admin`, etc)
- `sso_id`
- `sso_data`

## `chat_rooms`

Campos chave:
- `id` (PK string)
- `name`
- `type` (`support`, `support_ticket`)
- `description`
- `owner_id` (FK users)
- `created_at`, `updated_at`

## `messages`

Campos chave:
- `id` (PK string)
- `room_id` (FK chat_rooms)
- `user_id` (FK users)
- `content`
- `type` (text, audio, etc)
- `file_url`, `file_type`
- `is_read`, `read_at`
- `created_at`

## `room_participants`

Campos chave:
- `id` (PK string)
- `room_id` (FK chat_rooms)
- `user_id` (FK users)
- `joined_at`
- `left_at` (participante ativo quando `NULL`)

## `support_chamados_rooms`

Mapeia chamado para uma sala unica.

Campos chave:
- `chamado_id` (unico)
- `room_id` (unico)
- `created_by`
- `created_at`

## `metrics`

Campos chave:
- `id`
- `room_id` (opcional)
- `date`
- `messages_count`
- `active_users`
- `avg_response_time`
- `satisfaction_rating`

## `typing_status`

Campos chave:
- `id`
- `room_id`
- `user_id`
- `status`
- `updated_at`

## Relacoes relevantes

- `chat_rooms.owner_id -> users.id`
- `messages.user_id -> users.id`
- `messages.room_id -> chat_rooms.id`
- `room_participants.user_id -> users.id`
- `room_participants.room_id -> chat_rooms.id`
- `support_chamados_rooms.room_id -> chat_rooms.id`
- `support_chamados_rooms.created_by -> users.id`

## Estrategia de criacao/sync

1. `syncDatabase()` executa `sequelize.authenticate()` + `sequelize.sync()`
2. `ensureUsersColumns()` garante colunas `sso_id` e `sso_data`
3. `runMigrations()` executa seed inicial uma unica vez com controle em:
   - `src/config/.migrations-done.json`

## Seed inicial (primeira execucao)

- Cria usuarios demo
- Cria sala "Suporte"
- Cria mensagens iniciais
- Marca admin como online

