const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const cors = require('cors');
const dotenv = require('dotenv');

const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env';
dotenv.config({ path: path.resolve(process.cwd(), envFile) });
dotenv.config();

const { runMigrations } = require('./config/migrations');
const { syncDatabase } = require('./models/sequelize-models');

const app = express();
const isProd = process.env.NODE_ENV === 'production';
const isDev = !isProd;
let startupError = null;
const strictStartup = process.env.STRICT_STARTUP === 'true';

if (process.env.PROXY_TRUST === '1' || process.env.PROXY_TRUST === 'true') {
  app.set('trust proxy', 1);
}

const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: allowedOrigins.length ? allowedOrigins : true,
  credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

const uploadsPath = process.env.FILES_DIR
  ? path.resolve(process.cwd(), process.env.FILES_DIR)
  : path.join(__dirname, '../public/uploads');
app.use('/uploads', express.static(uploadsPath));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

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

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const chatRoutes = require('./routes/chat');
const chatApiRoutes = require('./routes/chat-api');
const messageRoutes = require('./routes/messages');
const ssoRoutes = require('./routes/sso');
const SSOController = require('./controllers/SSOController');

app.use('/auth', authRoutes);
app.use('/api/auth/sso', ssoRoutes);
app.get('/callback', SSOController.callback.bind(SSOController));
app.use('/dashboard', dashboardRoutes);
app.use('/chat', chatRoutes);
app.use('/api/chat', chatApiRoutes);
app.use('/api/messages', messageRoutes);

app.get('/', (req, res) => {
  if (isDev && startupError) {
    const message = startupError?.message || String(startupError);
    const stack = startupError?.stack || '';
    return res.status(500).send(`
      <!doctype html>
      <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Erro de inicializacao</title>
        <style>
          body { font-family: Arial, sans-serif; background:#111827; color:#e5e7eb; margin:0; padding:24px; }
          .box { max-width:1000px; margin:0 auto; background:#1f2937; border:1px solid #374151; border-radius:12px; padding:16px; }
          h1 { margin:0 0 12px 0; font-size:20px; color:#fca5a5; }
          p { margin:0 0 12px 0; color:#d1d5db; }
          pre { white-space:pre-wrap; background:#0b1220; border:1px solid #334155; border-radius:8px; padding:12px; overflow:auto; }
          code { color:#fca5a5; }
        </style>
      </head>
      <body>
        <div class="box">
          <h1>Erro ao inicializar o servidor (modo development)</h1>
          <p>O servidor subiu para depuracao, mas a inicializacao falhou:</p>
          <pre><code>${escapeHtml(message)}</code></pre>
          ${stack ? `<pre><code>${escapeHtml(stack)}</code></pre>` : ''}
        </div>
      </body>
      </html>
    `);
  }

  if (isProd && startupError) {
    return res.status(503).send(`
      <!doctype html>
      <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Servico temporariamente indisponivel</title>
        <style>
          body { font-family: Arial, sans-serif; background:#f8fafc; color:#0f172a; margin:0; padding:24px; }
          .box { max-width:820px; margin:40px auto; background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:18px; }
          h1 { margin:0 0 8px 0; font-size:22px; color:#b91c1c; }
          p { margin:0 0 8px 0; color:#334155; }
        </style>
      </head>
      <body>
        <div class="box">
          <h1>Servico temporariamente indisponivel</h1>
          <p>O sistema iniciou com falha de bootstrap.</p>
          <p>Tente novamente em alguns instantes.</p>
        </div>
      </body>
      </html>
    `);
  }

  if (req.session.user) {
    res.redirect('/dashboard');
  } else {
    res.render('index', { title: 'Chat Taiksu - Chat de Suporte' });
  }
});

app.get('/health', (_req, res) => {
  res.json({
    ok: !startupError,
    service: 'chat-taiksu',
    env: process.env.NODE_ENV || 'development',
    startupError: startupError ? (startupError.message || String(startupError)) : null
  });
});

app.get('/widget-test', (req, res) => {
  res.render('widget-test', {
    title: 'Widget Test - Chat Taiksu',
    defaults: {
      serverUrl: process.env.APP_URL || `http://${HOST}:${PORT}`,
      roomId: req.query.roomId || '',
      userId: req.query.userId || '',
      authToken: req.query.token || ''
    }
  });
});

app.use((req, res) => {
  res.status(404).render('error', { message: 'Pagina nao encontrada' });
});

const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';

(async () => {
  try {
    await syncDatabase();
    console.log('Verificando migracoes do banco...');
    await runMigrations();
  } catch (error) {
    console.error('Erro ao inicializar servidor:', error);
    startupError = error;

    if (strictStartup) {
      process.exit(1);
    }

    console.warn('Servidor iniciado com falha de bootstrap. /health mostra detalhes.');
  }

  app.listen(PORT, HOST, () => {
    const appUrl = process.env.APP_URL || `http://${HOST}:${PORT}`;
    console.log(`Chat Taiksu rodando em ${appUrl}`);
  });
})();

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = app;
