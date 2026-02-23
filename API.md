# 📚 Documentação da API Chat Taiksu

## Base URL
```
http://localhost:3000
```

## 🔐 Autenticação

Todos os endpoints da API (exceto login/registro) requerem que o usuário esteja autenticado via sessão.

---

## 🔑 Endpoints de Autenticação

### 1. Registrar Novo Usuário
```
POST /auth/register
```

**Body:**
```json
{
  "name": "João Silva",
  "email": "joao@example.com",
  "password": "senha123",
  "passwordConfirm": "senha123"
}
```

**Response (201):**
```json
{
  "id": "uuid",
  "name": "João Silva",
  "email": "joao@example.com",
  "status": "offline"
}
```

---

### 2. Fazer Login
```
POST /auth/login
```

**Body:**
```json
{
  "email": "joao@example.com",
  "password": "senha123"
}
```

**Response (200):**
Redireciona para `/dashboard`

**Error (401):**
```json
{
  "message": "Email ou senha inválidos"
}
```

---

### 3. Fazer Logout
```
GET /auth/logout
```

**Response:**
Redireciona para página inicial

---

## 💬 Endpoints de Chat

### 1. Listar Salas
```
GET /chat/rooms
```

**Response (200):**
```json
[
  {
    "id": "uuid",
    "name": "Suporte Geral",
    "description": "Sala para dúvidas gerais",
    "type": "support",
    "participantsCount": 5,
    "unreadCount": 2,
    "created_at": "2026-02-23T10:00:00Z"
  }
]
```

---

### 2. Abrir Sala
```
GET /chat/room/:roomId
```

**Response (200):**
Retorna página HTML com chat aberto

---

### 3. Criar Nova Sala
```
POST /chat/create-room
```

**Body:**
```json
{
  "name": "Suporte Premium",
  "description": "Para clientes premium"
}
```

**Response (201):**
```json
{
  "success": true,
  "room": {
    "id": "uuid",
    "name": "Suporte Premium",
    "description": "Para clientes premium",
    "ownerId": "uuid",
    "type": "support",
    "created_at": "2026-02-23T10:00:00Z"
  }
}
```

---

## 📨 Endpoints de Mensagens

### 1. Enviar Mensagem
```
POST /api/messages/send
```

**Body (multipart/form-data):**
```
roomId: "uuid"
content: "Olá, como posso ajudar?"
type: "text"  // ou: "image", "video", "audio", "file"
file: <arquivo opcional>
```

**Response (200):**
```json
{
  "success": true,
  "message": {
    "id": "uuid",
    "roomId": "uuid",
    "userId": "uuid",
    "content": "Olá, como posso ajudar?",
    "type": "text",
    "created_at": "2026-02-23T10:00:00Z"
  }
}
```

---

### 2. Obter Mensagens da Sala
```
GET /api/messages/:roomId?limit=50
```

**Query Parameters:**
- `limit` (opcional): Número de mensagens a retornar (padrão: 50)

**Response (200):**
```json
[
  {
    "id": "uuid",
    "roomId": "uuid",
    "userId": "uuid",
    "name": "João Silva",
    "avatar": "url",
    "content": "Olá!",
    "type": "text",
    "fileUrl": null,
    "is_read": 1,
    "read_at": "2026-02-23T10:05:00Z",
    "created_at": "2026-02-23T10:00:00Z"
  }
]
```

---

### 3. Marcar Mensagem como Lida
```
POST /api/messages/mark-read
```

**Body:**
```json
{
  "messageId": "uuid"
}
```

**Response (200):**
```json
{
  "success": true
}
```

---

### 4. Deletar Mensagem
```
DELETE /api/messages/:messageId
```

**Response (200):**
```json
{
  "success": true
}
```

**Error (403):**
```json
{
  "error": "Sem permissão"
}
```

---

### 5. Server-Sent Events (SSE)
```
GET /api/messages/stream/:roomId
```

**Resposta:** Stream em tempo real de eventos

**Tipos de Eventos:**

#### Nova Mensagem
```json
{
  "type": "new_message",
  "message": {
    "id": "uuid",
    "roomId": "uuid",
    "userId": "uuid",
    "name": "João Silva",
    "avatar": "url",
    "content": "Olá!",
    "created_at": "2026-02-23T10:00:00Z"
  }
}
```

#### Status de Digitação
```json
{
  "type": "typing_status",
  "userId": "uuid",
  "userName": "João Silva",
  "isTyping": true
}
```

#### Mensagem Deletada
```json
{
  "type": "message_deleted",
  "messageId": "uuid"
}
```

---

### 6. Atualizar Status de Digitação
```
POST /api/messages/typing/:roomId
```

**Body:**
```json
{
  "isTyping": true
}
```

**Response (200):**
```json
{
  "success": true
}
```

---

## 📊 Endpoints do Dashboard

### 1. Página Principal
```
GET /dashboard
```

**Response (200):**
Retorna página HTML do dashboard com métricas

---

### 2. Obter Métricas
```
GET /dashboard/metrics
```

**Response (200):**
```json
[
  {
    "id": "uuid",
    "date": "2026-02-23",
    "messages_count": 45,
    "active_users": 12,
    "avg_response_time": 180,
    "satisfaction_rating": 4.5
  }
]
```

---

## 🔄 Tipos de Dados

### User Object
```json
{
  "id": "uuid",
  "name": "João Silva",
  "email": "joao@example.com",
  "avatar": "url/para/avatar.jpg",
  "status": "online|offline",
  "role": "user|admin",
  "created_at": "2026-02-23T10:00:00Z",
  "updated_at": "2026-02-23T10:00:00Z"
}
```

### Message Object
```json
{
  "id": "uuid",
  "roomId": "uuid",
  "userId": "uuid",
  "content": "Conteúdo da mensagem",
  "type": "text|image|video|audio|file",
  "fileUrl": "url/para/arquivo",
  "fileType": "image/jpeg",
  "is_read": 0|1,
  "read_at": "2026-02-23T10:00:00Z",
  "created_at": "2026-02-23T10:00:00Z"
}
```

### ChatRoom Object
```json
{
  "id": "uuid",
  "name": "Nome da Sala",
  "description": "Descrição",
  "type": "support|sales",
  "ownerId": "uuid",
  "created_at": "2026-02-23T10:00:00Z",
  "updated_at": "2026-02-23T10:00:00Z"
}
```

---

## ⚠️ Códigos de Erro HTTP

| Código | Descrição |
|--------|-----------|
| 200 | OK - Requisição bem-sucedida |
| 201 | Created - Recurso criado |
| 400 | Bad Request - Dados inválidos |
| 401 | Unauthorized - Não autenticado |
| 403 | Forbidden - Sem permissão |
| 404 | Not Found - Recurso não encontrado |
| 500 | Server Error - Erro no servidor |

---

## 🧪 Exemplos cURL

### Login
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "joao@example.com",
    "password": "senha123"
  }' \
  -c cookies.txt
```

### Enviar Mensagem
```bash
curl -X POST http://localhost:3000/api/messages/send \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "roomId": "uuid-da-sala",
    "content": "Olá!",
    "type": "text"
  }'
```

### Enviar Arquivo
```bash
curl -X POST http://localhost:3000/api/messages/send \
  -b cookies.txt \
  -F "roomId=uuid-da-sala" \
  -F "file=@foto.jpg" \
  -F "type=image"
```

### SSE Stream
```bash
curl -N -H "Accept: text/event-stream" \
  -b cookies.txt \
  http://localhost:3000/api/messages/stream/uuid-da-sala
```

---

## 📱 Integração com Widget

O widget JavaScript usa automaticamente os endpoints descritos acima. Veja `widget-example.html` para mais detalhes.

---

## 📞 Suporte

Para dúvidas ou problemas com a API, consulte o README.md ou abra uma issue no repositório.
