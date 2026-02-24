const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

class AuthController {
  mapAuthErrorMessage(errorCode) {
    const map = {
      missing_token: 'Token SSO ausente no callback.',
      invalid_token: 'Token SSO invalido ou expirado.',
      session_save_failed: 'Falha ao criar sessao de login.',
      sso_callback_failed: 'Erro ao processar callback SSO.'
    };
    return map[errorCode] || null;
  }

  persistSessionAndRedirect(req, res, statusCode = null) {
    return req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).render('auth/login', {
          title: 'Login - Chat Taiksu',
          message: 'Erro ao iniciar sessao',
          user: null
        });
      }

      if (statusCode) {
        return res.status(statusCode).redirect('/dashboard');
      }
      return res.redirect('/dashboard');
    });
  }

  async showLogin(req, res) {
    const message = this.mapAuthErrorMessage(req.query?.error) || null;
    res.render('auth/login', { title: 'Login - Chat Taiksu', message });
  }

  async showRegister(req, res) {
    res.render('auth/register', { title: 'Registre-se - Chat Taiksu', message: null });
  }

  async register(req, res) {
    try {
      const { name, email, password, passwordConfirm } = req.body;

      // Validações
      if (!name || !email || !password || !passwordConfirm) {
        return res.status(400).render('auth/register', {
          title: 'Registre-se - Chat Taiksu',
          message: 'Preencha todos os campos',
          user: req.session.user || null
        });
      }

      if (password !== passwordConfirm) {
        return res.status(400).render('auth/register', {
          title: 'Registre-se - Chat Taiksu',
          message: 'As senhas não correspondem',
          user: req.session.user || null
        });
      }

      // Verificar se email já existe
      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        return res.status(400).render('auth/register', {
          title: 'Registre-se - Chat Taiksu',
          message: 'Este email já está registrado',
          user: req.session.user || null
        });
      }

      // Hash da senha
      const hashedPassword = await bcrypt.hash(password, 10);

      // Criar usuário
      const user = await User.create({
        name,
        email,
        password: hashedPassword,
        avatar: null,
        role: 'user'
      });

      // Salvar na sessão
      req.session.user = user;

      return this.persistSessionAndRedirect(req, res, 201);
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).render('auth/register', {
        title: 'Registre-se - Chat Taiksu',
        message: 'Erro ao registrar',
        user: req.session.user || null
      });
    }
  }

  async login(req, res) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).render('auth/login', {
          title: 'Login - Chat Taiksu',
          message: 'Email e senha são obrigatórios',
          user: null
        });
      }

      const user = await User.findByEmail(email);

      if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).render('auth/login', {
          title: 'Login - Chat Taiksu',
          message: 'Email ou senha inválidos',
          user: null
        });
      }

      // Atualizar status para online
      await User.updateStatus(user.id, 'online');

      // Salvar na sessão
      req.session.user = user;

      return this.persistSessionAndRedirect(req, res);
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).render('auth/login', {
        title: 'Login - Chat Taiksu',
        message: 'Erro ao fazer login',
        user: null
      });
    }
  }

  async logout(req, res) {
    try {
      if (req.session.user) {
        await User.updateStatus(req.session.user.id, 'offline');
      }
      req.session.destroy(() => {
        res.redirect('/');
      });
    } catch (error) {
      console.error('Logout error:', error);
      res.redirect('/');
    }
  }
}

module.exports = new AuthController();
