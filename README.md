# 💬 Chat Taiksu - Plataforma de Chat de Suporte

Aplicação completa de chat para suporte ao cliente com Dashboard, APIs REST, SSE em tempo real e widget embutível.

## 🚀 Funcionalidades

### Core
- ✅ Autenticação de usuários
- ✅ Salas de chat em tempo real (SSE)
- ✅ Sistema de mensagens com leitura
- ✅ Status de digitação em tempo real
- ✅ Suporte a múltiplos tipos de arquivo (áudio, vídeo, imagem, documento)

### Dashboard
- 📊 Métricas de uso
- 📈 Gráficos de atividade
- 👥 Estatísticas de usuários
- 💬 Contagem de mensagens

### Widget
- 🎨 Widget JavaScript embutível
- 📱 Responsivo para mobile
- 🔌 Fácil integração em qualquer site

## 📋 Pré-requisitos

- Node.js 14+
- npm ou yarn

## 🔧 Instalação

1. Clone o repositório:
```bash
git clone <seu-repo>
cd chat.taiksu
```

2. Instale as dependências:
```bash
npm install
```

3. Configure o arquivo `.env`:
```bash
PORT=3000
NODE_ENV=development
SESSION_SECRET=sua_chave_secreta
JWT_SECRET=sua_jwt_secret
```

## ▶️ Execução

### Desenvolvimento
```bash
npm run dev
```

### Produção
```bash
npm start
```

A aplicação estará disponível em `http://localhost:3000`

## 📂 Estrutura do Projeto

```
src/
├── config/          # Configurações (banco de dados)
├── controllers/     # Lógica de negócio
├── models/          # Modelos de dados
├── routes/          # Definição de rotas
├── middleware/      # Middlewares Express
├── utils/           # Funções utilitárias
├── views/           # Templates EJS
│   ├── auth/        # Login e Registro
│   ├── dashboard/   # Dashboard e Métricas
│   ├── chat/        # Interface de Chat
│   └── index.ejs    # Página inicial
└── server.js        # Arquivo principal

public/
├── css/             # Estilos CSS
├── js/              # JavaScript do cliente
│   └── taiksu-widget.js  # Widget embutível
└── uploads/         # Arquivos enviados
```

## 🔌 API REST

### Autenticação
- `POST /auth/register` - Registrar novo usuário
- `POST /auth/login` - Fazer login
- `GET /auth/logout` - Fazer logout

### Chat
- `GET /chat/rooms` - Listar salas de chat
- `GET /chat/room/:roomId` - Abrir sala
- `POST /chat/create-room` - Criar nova sala

### Mensagens
- `GET /api/messages/:roomId` - Obter mensagens da sala
- `POST /api/messages/send` - Enviar mensagem
- `POST /api/messages/mark-read` - Marcar como lido
- `DELETE /api/messages/:messageId` - Deletar mensagem
- `GET /api/messages/stream/:roomId` - SSE Stream
- `POST /api/messages/typing/:roomId` - Atualizar status de digitação

### Dashboard
- `GET /dashboard` - Página principal
- `GET /dashboard/metrics` - Obter métricas (JSON)

## 📦 Widget Embutível

Integre o chat em seu site:

```html
<!-- Incluir script -->
<script src="https://seu-servidor.com/js/taiksu-widget.js"></script>

<!-- Inicializar widget -->
<script>
  TaiksuChat.init({
    serverUrl: 'https://seu-servidor.com',
    roomId: 'id-da-sala-aqui',
    title: 'Suporte ao Cliente',
    position: 'bottom-right'
  });
</script>
```

### Opções de Configuração

```javascript
{
  serverUrl: string,      // URL do servidor Chat Taiksu
  roomId: string,         // ID da sala de chat
  title: string,          // Título do widget
  position: string,       // 'bottom-right', 'bottom-left', etc
  autoOpen: boolean       // Abrir automaticamente
}
```

## 🗄️ Banco de Dados

Utiliza SQLite com as seguintes tabelas:
- `users` - Usuários cadastrados
- `chat_rooms` - Salas de chat
- `messages` - Mensagens
- `room_participants` - Participantes das salas
- `metrics` - Métricas de uso
- `typing_status` - Status de digitação

## 🔐 Segurança

- Senhas armazenadas com hash bcrypt
- Sessões autenticadas
- Validação de entrada
- CORS configurado

## 📱 Recursos

### Mensagens
- Texto simples
- Imagens
- Vídeos
- Áudio
- Documentos
- Status de leitura (✓ Lido)
- Hora de envio

### Usuários
- Avatar em círculo
- Status online/offline
- Perfil com foto
- Nome e email

### Tempo Real
- SSE (Server-Sent Events) para updates
- Indicador de digitação
- Notificações de nova mensagem
- Sincronização em tempo real

## 🛠️ Desenvolvimento

### Adicionar Nova Rota

1. Criar controller em `src/controllers/`
2. Adicionar rota em `src/routes/`
3. Criar view em `src/views/`
4. Importar rota em `src/server.js`

### Adicionar Novo Modelo

Criar arquivo em `src/models/` com classe estática usando promises.

## 📄 Licença

MIT

## 👥 Contribuindo

Faça um fork, crie uma branch, faça suas mudanças e envie um pull request!

## 📞 Suporte

Para problemas ou sugestões, abra uma issue no repositório.

---

**Chat Taiksu** - Plataforma completa de chat para suporte ao cliente | 2026
