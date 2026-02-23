# 🛠️ Guia de Desenvolvimento - Chat Taiksu

## 📦 Estrutura do Projeto

```
chat.taiksu/
├── src/
│   ├── config/
│   │   └── database.js          # Configuração SQLite
│   ├── controllers/
│   │   ├── AuthController.js    # Lógica de autenticação
│   │   ├── ChatController.js    # Lógica de chat
│   │   ├── DashboardController.js
│   │   └── MessageController.js # Lógica de mensagens
│   ├── models/
│   │   ├── User.js              # Modelo de usuário
│   │   ├── ChatRoom.js          # Modelo de sala
│   │   └── Message.js           # Modelo de mensagem
│   ├── routes/
│   │   ├── auth.js
│   │   ├── chat.js
│   │   ├── dashboard.js
│   │   └── messages.js
│   ├── views/
│   │   ├── index.ejs            # Home
│   │   ├── auth/
│   │   │   ├── login.ejs
│   │   │   └── register.ejs
│   │   ├── dashboard/
│   │   │   └── index.ejs
│   │   ├── chat/
│   │   │   ├── rooms.ejs
│   │   │   └── room.ejs
│   │   ├── layout.ejs
│   │   └── error.ejs
│   ├── server.js                # Arquivo principal
│   └── seed.js                  # Script de seed
├── public/
│   ├── css/
│   ├── js/
│   │   └── taiksu-widget.js     # Widget embutível
│   ├── uploads/                 # Arquivos enviados
│   └── widget-example.html      # Exemplo widget
├── package.json
├── .env                         # Variáveis de ambiente
├── .gitignore
├── README.md
├── API.md                       # Documentação API
└── DEVELOPMENT.md               # Este arquivo
```

---

## 🚀 Primeiros Passos

### 1. Instalação
```bash
npm install
npm run seed
npm start
```

### 2. Acessar a Aplicação
- Home: `http://localhost:3000`
- Login: `http://localhost:3000/auth/login`
- Dashboard: `http://localhost:3000/dashboard`
- Salas: `http://localhost:3000/chat/rooms`

### 3. Contas de Teste
```
Admin:  admin@taiksu.com / admin123
João:   joao@example.com / senha123
Maria:  maria@example.com / senha123
Pedro:  pedro@example.com / senha123
```

---

## 📝 Padrões de Código

### Controllers

Os controllers contêm a lógica de negócio. Eles recebem requisições, processam dados e chamam modelos.

**Exemplo:**
```javascript
class MyController {
  async myAction(req, res) {
    try {
      // Lógica aqui
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new MyController();
```

### Models

Os modelos encapsulam a lógica de acesso aos dados. Todos retornam Promises.

**Exemplo:**
```javascript
class MyModel {
  static findById(id) {
    return new Promise((resolve, reject) => {
      db.get(`SELECT * FROM table WHERE id = ?`, [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }
}

module.exports = MyModel;
```

### Routes

As rotas definem os endpoints da aplicação e chamam controllers.

**Exemplo:**
```javascript
const router = express.Router();

router.get('/items/:id', MyController.getItem);
router.post('/items', MyController.createItem);

module.exports = router;
```

### Views

As views usam EJS para renderizar HTML dinâmico.

**Exemplo:**
```ejs
<div class="item">
  <h2><%= item.name %></h2>
  <p><%= item.description %></p>
  <% if (user) { %>
    <button>Editar</button>
  <% } %>
</div>
```

---

## ➕ Adicionar Nova Rota

### 1. Criar Controller
```javascript
// src/controllers/MyController.js
class MyController {
  async index(req, res) {
    // renderizar view
    res.render('my/index', { title: 'Página' });
  }

  async create(req, res) {
    // processar dados
    res.json({ success: true });
  }
}

module.exports = new MyController();
```

### 2. Criar Routes
```javascript
// src/routes/my.js
const router = express.Router();
const MyController = require('../controllers/MyController');

router.get('/', MyController.index);
router.post('/', MyController.create);

module.exports = router;
```

### 3. Importar em server.js
```javascript
const myRoutes = require('./routes/my');
app.use('/my', myRoutes);
```

### 4. Criar View (se necessário)
```bash
mkdir -p src/views/my
# Criar src/views/my/index.ejs
```

---

## ➕ Adicionar Novo Modelo

### 1. Criar Arquivo
```javascript
// src/models/MyModel.js
const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class MyModel {
  static create(data) {
    return new Promise((resolve, reject) => {
      const id = uuidv4();
      // INSERT query aqui
    });
  }

  static findById(id) {
    return new Promise((resolve, reject) => {
      // SELECT query aqui
    });
  }
}

module.exports = MyModel;
```

### 2. Usar no Controller
```javascript
const MyModel = require('../models/MyModel');

class MyController {
  async show(req, res) {
    const item = await MyModel.findById(req.params.id);
    res.json(item);
  }
}
```

---

## 🗄️ Banco de Dados

### Executar Migrations
```bash
npm run seed
```

### Estrutura SQLite
```sql
-- Usuários
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  avatar TEXT,
  status TEXT DEFAULT 'offline',
  role TEXT DEFAULT 'user',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Salas
CREATE TABLE chat_rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'support',
  description TEXT,
  owner_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Mensagens
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT,
  type TEXT DEFAULT 'text',
  file_url TEXT,
  is_read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Adicionar Tabela
1. Editar `src/config/database.js`
2. Adicionar `db.run()` na função `initializeDatabase()`
3. Executar seed novamente

---

## 🔐 Segurança

### Autenticação
- Senhas com hash bcrypt
- Sessões com express-session
- Middleware de autenticação

### Validação
- Validar entrada do usuário
- Sanitizar dados antes de usar em queries
- Validar tipo de arquivo

### CORS
```javascript
// server.js
const cors = require('cors');
app.use(cors({
  origin: ['http://localhost:3000', 'https://seu-dominio.com'],
  credentials: true
}));
```

---

## 📡 SSE (Server-Sent Events)

### Enviar Evento
```javascript
// No controller
const clients = global.sseClients[roomId] || [];
clients.forEach(client => {
  client.write(`data: ${JSON.stringify({
    type: 'new_message',
    message: data
  })}\n\n`);
});
```

### Conectar no Cliente
```javascript
const eventSource = new EventSource('/api/messages/stream/' + roomId);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data);
};
```

---

## 📁 Upload de Arquivos

### Configurar Multer
```javascript
const multer = require('multer');
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, './public/uploads');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + file.originalname);
  }
});

const upload = multer({ storage });
```

### Usar no Controller
```javascript
router.post('/upload', upload.single('file'), (req, res) => {
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({ fileUrl });
});
```

---

## 🧪 Testes Manuais

### Login
1. Ir para `http://localhost:3000/auth/login`
2. Usar: `admin@taiksu.com` / `admin123`
3. Verificar redirecionamento para dashboard

### Criar Mensagem
1. Ir para `http://localhost:3000/chat/rooms`
2. Clicar em uma sala
3. Digitar mensagem e enviar
4. Verificar se aparece em tempo real

### Upload de Arquivo
1. Na sala de chat
2. Clicar no ícone de clipe
3. Selecionar arquivo
4. Verificar se arquivo foi enviado

---

## 🐛 Debugging

### Console Logs
```javascript
console.log('Informação:', data);
console.error('Erro:', error);
```

### Node Debugger
```bash
node --inspect src/server.js
# Depois abrir chrome://inspect
```

### Variáveis de Ambiente
```javascript
// Ver todos os .env
require('dotenv').config();
console.log(process.env.PORT);
```

---

## 📦 Build para Produção

### Instalar PM2
```bash
npm install -g pm2
```

### Iniciar com PM2
```bash
pm2 start src/server.js --name "chat-taiksu"
pm2 save
pm2 startup
```

### Configurar Nginx
```nginx
server {
  listen 80;
  server_name seu-dominio.com;

  location / {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
  }
}
```

---

## 📚 Recursos Úteis

- [Express Docs](https://expressjs.com/)
- [EJS Docs](https://ejs.co/)
- [SQLite Docs](https://www.sqlite.org/docs.html)
- [MDN Web Docs](https://developer.mozilla.org/)

---

## 💡 Próximas Melhorias

- [ ] Autenticação com JWT
- [ ] Suporte a múltiplos widgets
- [ ] Criptografia de mensagens
- [ ] Backup automático de BD
- [ ] Rate limiting
- [ ] Notificações por email
- [ ] Mobile app nativa
- [ ] Suporte a transferência de chat

---

## 🤝 Contribuindo

1. Criar branch: `git checkout -b feature/minha-feature`
2. Fazer commits: `git commit -am 'Adiciona feature'`
3. Push: `git push origin feature/minha-feature`
4. Abrir Pull Request

---

## 📄 Licença

MIT
