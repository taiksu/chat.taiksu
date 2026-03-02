/**
 * Controller para autenticacao via SSO
 * Gerencia validacao de tokens e integracao com servidor centralizado
 */

const { validateSSOToken, validateSSOTokenDetailed } = require('../middleware/ssoValidation');
const User = require('../models/User');
const { resolveRoleFromGroup } = require('../utils/ssoRole');
const TOKEN_COOKIE_NAME = process.env.SSO_TOKEN_COOKIE_NAME || 'taiksu_sso_token';

class SSOController {
  persistSessionAndRedirect(req, res, url) {
    return req.session.save((err) => {
      if (err) {
        console.error('SSO session save error:', err);
        return res.redirect(process.env.SSO_URL || '/');
      }
      return res.redirect(url);
    });
  }

  /**
   * Callback SSO via querystring
   * GET /callback?token=JWT
   */
  async callback(req, res) {
    try {
      const token = req.query && req.query.token;
      const ssoUrl = process.env.SSO_URL || '/';

      if (!token) {
        return res.redirect(ssoUrl);
      }

      const validation = await validateSSOTokenDetailed(token);
      if (!validation.ok) {
        console.error('[SSO callback] Token rejeitado', {
          status: validation.status,
          error: validation.error,
          message: validation.message,
          responseBody: validation.responseBody
        });
        return res.redirect(ssoUrl);
      }
      const ssoUserData = validation.userData;

      const user = await this.syncSSOUser(ssoUserData);
      await User.updateStatus(user.id, 'online');
      req.session.user = user;
      req.session.ssoUser = ssoUserData;
      req.session.ssoToken = token;

      const isProd = process.env.NODE_ENV === 'production';
      res.cookie(TOKEN_COOKIE_NAME, token, {
        httpOnly: true,
        secure: isProd,
        sameSite: process.env.SESSION_COOKIE_SAMESITE || 'lax',
        domain: process.env.SESSION_COOKIE_DOMAIN || undefined,
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      return this.persistSessionAndRedirect(req, res, '/dashboard');
    } catch (error) {
      console.error('SSO callback error:', error);
      return res.redirect(process.env.SSO_URL || '/');
    }
  }

  /**
   * Valida um token SSO e retorna dados do usuario
   * POST /api/auth/sso/validate
   * Body: { token: 'token_jwt' }
   */
  async validateToken(req, res) {
    try {
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({
          success: false,
          message: 'Token nao fornecido'
        });
      }

      const ssoUserData = await validateSSOToken(token);

      if (!ssoUserData) {
        return res.status(401).json({
          success: false,
          message: 'Token invalido ou expirado'
        });
      }

      const user = await this.syncSSOUser(ssoUserData);
      await User.updateStatus(user.id, 'online');

      req.session.user = user;
      req.session.ssoUser = ssoUserData;
      req.session.ssoToken = token;

      return req.session.save((err) => {
        if (err) {
          console.error('SSO session save error:', err);
          return res.status(500).json({
            success: false,
            message: 'Erro ao salvar sessao'
          });
        }

        return res.status(200).json({
          success: true,
          message: 'Autenticacao bem-sucedida',
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            avatar: user.avatar,
            role: user.role
          }
        });
      });
    } catch (error) {
      console.error('Erro em SSOController.validateToken():', error);
      return res.status(500).json({
        success: false,
        message: 'Erro ao validar token',
        debug: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Sincroniza usuario do SSO com o banco local
   * Cria ou atualiza usuario se ja existe
   */
  async syncSSOUser(ssoUserData) {
    try {
      const { id, name, email, foto, grupo_nome } = ssoUserData;
      const role = resolveRoleFromGroup(grupo_nome);

      let user = await User.findByEmail(email);

      if (!user) {
        user = await User.create({
          name,
          email,
          password: null,
          avatar: foto || null,
          role,
          ssoId: id,
          ssoData: JSON.stringify(ssoUserData)
        });
      } else {
        await User.update(user.id, {
          name,
          avatar: foto || user.avatar,
          role,
          ssoId: id,
          ssoData: JSON.stringify(ssoUserData)
        });
        user = await User.findById(user.id);
      }

      return user;
    } catch (error) {
      console.error('Erro ao sincronizar usuario SSO:', error);
      throw error;
    }
  }

  /**
   * Retorna dados do usuario SSO autenticado
   * GET /api/auth/sso/me
   */
  async getCurrentUser(req, res) {
    try {
      if (!req.session.user) {
        return res.status(401).json({
          success: false,
          message: 'Usuario nao autenticado'
        });
      }

      return res.status(200).json({
        success: true,
        user: req.session.user,
        ssoData: req.session.ssoUser || null
      });
    } catch (error) {
      console.error('Get current user error:', error);
      return res.status(500).json({
        success: false,
        message: 'Erro ao obter dados do usuario'
      });
    }
  }

  /**
   * Logout de usuario SSO
   * POST /api/auth/sso/logout
   */
  async logout(req, res) {
    try {
      if (req.session.user) {
        await User.updateStatus(req.session.user.id, 'offline');
      }

      req.session.destroy(() => {
        return res.status(200).json({
          success: true,
          message: 'Desconectado com sucesso'
        });
      });
    } catch (error) {
      console.error('SSO logout error:', error);
      return res.status(500).json({
        success: false,
        message: 'Erro ao fazer logout'
      });
    }
  }
}

module.exports = new SSOController();
