const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const cors = require('cors');
require('dotenv').config();

// Importar banco de dados
const db = require('./config/database');
const { runMigrations } = require('./config/migrations');

// Criar app
const app = express();
const isProd = process.env.NODE_ENV === 'production';

if (process.env.PROXY_TRUST === '1' || process.env.PROXY_TRUST === 'true') {
  app.set('trust proxy', 1);
}

const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// Middleware global
app.use(cors({
  origin: allowedOrigins.length ? allowedOrigins : true,
  credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// Servir arquivos enviados a partir de um diretório fora do repositório (configurável)
const uploadsPath = process.env.FILES_DIR
  ? path.resolve(process.cwd(), process.env.FILES_DIR)
  : path.join(__dirname, '../public/uploads');
app.use('/uploads', express.static(uploadsPath));

// Configurar EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Configurar sessão
app.use(session({
  secret: process.env.SESSION_SECRET || 'chat_taiksu_secret',
  resave: false,
  saveUninitialized: true,
  name: process.env.SESSION_COOKIE_NAME || 'taiksu.sid',
  cookie: { 
    secure: process.env.SESSION_COOKIE_SECURE
      ? process.env.SESSION_COOKIE_SECURE === 'true'
      : isProd,
    sameSite: process.env.SESSION_COOKIE_SAMESITE || 'lax',
    domain: process.env.SESSION_COOKIE_DOMAIN || undefined,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Middleware de autenticação
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Rotas
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const chatRoutes = require('./routes/chat');
const chatApiRoutes = require('./routes/chat-api');
const messageRoutes = require('./routes/messages');
const ssoRoutes = require('./routes/sso');

app.use('/auth', authRoutes);
app.use('/api/auth/sso', ssoRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/chat', chatRoutes);
app.use('/api/chat', chatApiRoutes);
app.use('/api/messages', messageRoutes);

// Rota inicial
app.get('/', (req, res) => {
  if (req.session.user) {
    res.redirect('/dashboard');
  } else {
    res.render('index', { title: 'Chat Taiksu - Chat de Suporte' });
  }
});

// Healthcheck para monitoramento em produção
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'chat-taiksu', env: process.env.NODE_ENV || 'development' });
});

// Rota 404
app.use((req, res) => {
  res.status(404).render('error', { message: 'Página não encontrada' });
});

// Inicializar servidor
const PORT = process.env.PORT || (isProd ? null : 3000);
const HOST = process.env.HOST || '0.0.0.0';

if (!PORT) {
  console.error('PORT nao definido em producao. Configure a porta interna fornecida pela hospedagem em process.env.PORT.');
  process.exit(1);
}

(async () => {
  try {
    // Executar migrations automáticas na primeira inicialização
    console.log('⏳ Verificando migrações do banco de dados...');
    await runMigrations();
    
    // Iniciar servidor após migrações
    app.listen(PORT, HOST, () => {
      const appUrl = process.env.APP_URL || `http://${HOST}:${PORT}`;
      console.log(`🚀 Chat Taiksu rodando em ${appUrl}`);
    });
  } catch (error) {
    console.error('❌ Erro ao inicializar servidor:', error);
    process.exit(1);
  }
})();

module.exports = app;
