const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const cors = require('cors');
require('dotenv').config();

// Importar banco de dados
const db = require('./config/database');

// Criar app
const app = express();

// Middleware global
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// Configurar EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Configurar sessão
app.use(session({
  secret: process.env.SESSION_SECRET || 'chat_taiksu_secret',
  resave: false,
  saveUninitialized: true,
  cookie: { 
    secure: false,
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
const messageRoutes = require('./routes/messages');
const ssoRoutes = require('./routes/sso');

app.use('/auth', authRoutes);
app.use('/api/auth/sso', ssoRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/chat', chatRoutes);
app.use('/api/messages', messageRoutes);

// Rota inicial
app.get('/', (req, res) => {
  if (req.session.user) {
    res.redirect('/dashboard');
  } else {
    res.render('index', { title: 'Chat Taiksu - Chat de Suporte' });
  }
});

// Rota 404
app.use((req, res) => {
  res.status(404).render('error', { message: 'Página não encontrada' });
});

// Inicializar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Chat Taiksu rodando em http://localhost:${PORT}`);
});

module.exports = app;
