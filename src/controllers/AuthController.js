const User = require('../models/User');
const { TOKEN_COOKIE_NAME } = require('../middleware/requireAuth');

class AuthController {
  getDevUsers() {
    return {
      alice: {
        id: 'user_alice',
        name: 'Alice Dev',
        email: 'alice@dev.com',
        role: 'admin',
        avatar: 'https://i.pravatar.cc/100?u=alice'
      },
      bob: {
        id: 'user_bob',
        name: 'Bob Atendente',
        email: 'bob@dev.com',
        role: 'agent',
        avatar: 'https://i.pravatar.cc/100?u=bob'
      },
      carol: {
        id: 'user_carol',
        name: 'Carol Cliente',
        email: 'carol@dev.com',
        role: 'user',
        avatar: 'https://i.pravatar.cc/100?u=carol'
      },
      dave: {
        id: 'user_dave',
        name: 'Dave Cliente',
        email: 'dave@dev.com',
        role: 'user',
        avatar: 'https://i.pravatar.cc/100?u=dave'
      }
    };
  }

  pickDevUser(requestedKey) {
    const users = this.getDevUsers();
    const key = String(requestedKey || 'alice').trim().toLowerCase();
    return users[key] || users.alice;
  }

  getSSOLoginUrl() {
    return process.env.SSO_URL || '/';
  }

  async showLogin(_req, res) {
    return res.redirect(this.getSSOLoginUrl());
  }

  async showRegister(_req, res) {
    return res.redirect(this.getSSOLoginUrl());
  }

  async register(_req, res) {
    return res.redirect(this.getSSOLoginUrl());
  }

  async login(_req, res) {
    return res.redirect(this.getSSOLoginUrl());
  }

  async logout(req, res) {
    try {
      if (req.session.user) {
        await User.updateStatus(req.session.user.id, 'offline');
      }
      req.session.destroy(() => {
        res.clearCookie(TOKEN_COOKIE_NAME, {
          domain: process.env.SESSION_COOKIE_DOMAIN || undefined,
          path: '/'
        });
        res.redirect('/');
      });
    } catch (error) {
      console.error('Logout error:', error);
      res.redirect('/');
    }
  }

  async devLogin(req, res) {
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd && process.env.ALLOW_DEV_LOGIN !== 'true') {
      return res.status(403).send('Dev login disabled in production.');
    }

    try {
      const { UserModel } = require('../models/sequelize-models');
      const requestedUser = req.params.userId || req.query.user;
      const redirectTo = req.query.redirect || '/dashboard';
      const profile = this.pickDevUser(requestedUser);
      let user = await UserModel.findByPk(profile.id, { raw: true });
      if (!user) {
        user = await UserModel.create({
          id: profile.id,
          name: profile.name,
          email: profile.email,
          role: profile.role,
          status: 'online',
          password: 'dev-password',
          avatar: profile.avatar
        });
        user = user.get({ plain: true });
      } else {
        await UserModel.update({
          name: profile.name,
          email: profile.email,
          role: profile.role,
          avatar: profile.avatar,
          status: 'online'
        }, {
          where: { id: profile.id }
        });
        user = { ...user, ...profile, status: 'online' };
      }

      req.session.user = user;
      res.redirect(redirectTo);
    } catch (error) {
      console.error('Dev login error:', error);
      res.status(500).send('Erro ao realizar dev login: ' + error.message);
    }
  }
}

module.exports = new AuthController();
