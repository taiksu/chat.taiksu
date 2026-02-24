const User = require('../models/User');
const { TOKEN_COOKIE_NAME } = require('../middleware/requireAuth');

class AuthController {
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
}

module.exports = new AuthController();
