/**
 * Controller para autenticação via SSO
 * Gerencia validação de tokens e integração com servidor centralizado
 */

const { validateSSOToken } = require('../middleware/ssoValidation');
const User = require('../models/User');

class SSOController {
  /**
   * Valida um token SSO e retorna dados do usuário
   * POST /api/auth/sso/validate
   * Body: { token: 'token_jwt' }
   */
  async validateToken(req, res) {
    try {
      const { token } = req.body;

      console.log('🔵 SSOController.validateToken() chamado');

      if (!token) {
        console.warn('⚠️ Token não fornecido no request body');
        return res.status(400).json({
          success: false,
          message: 'Token não fornecido'
        });
      }

      console.log('🔑 Iniciando validação do token...');
      // Validar token contra SSO
      const ssoUserData = await validateSSOToken(token);

      if (!ssoUserData) {
        console.error('❌ Validação retornou null/falso');
        return res.status(401).json({
          success: false,
          message: 'Token inválido ou expirado'
        });
      }

      console.log('👤 Sincronizando usuário no banco local...');
      // Sincronizar usuário no banco local
      const user = await this.syncSSOUser(ssoUserData);

      // Salvar na sessão
      req.session.user = user;
      req.session.ssoUser = ssoUserData;

      console.log(`✅ Usuário ${user.email} autenticado com sucesso`);

      return res.status(200).json({
        success: true,
        message: 'Autenticação bem-sucedida',
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          role: user.role
        }
      });
    } catch (error) {
      console.error('❌ Erro em SSOController.validateToken():');
      console.error(`   ${error.message}`);
      console.error(`   Stack: ${error.stack}`);
      return res.status(500).json({
        success: false,
        message: 'Erro ao validar token',
        debug: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Sincroniza usuário do SSO com o banco local
   * Cria ou atualiza usuário se já existe
   */
  async syncSSOUser(ssoUserData) {
    try {
      const { id, name, email, foto, grupo_nome, unidade } = ssoUserData;

      // Procurar usuário por email
      let user = await User.findByEmail(email);

      if (!user) {
        // Criar novo usuário
        user = await User.create({
          name,
          email,
          password: null, // SSO não usa senha local
          avatar: foto || null,
          role: grupo_nome === 'Administrador' ? 'admin' : 'user',
          ssoId: id,
          ssoData: JSON.stringify(ssoUserData)
        });
      } else {
        // Atualizar dados do usuário existente
        await User.update(user.id, {
          name,
          avatar: foto || user.avatar,
          role: grupo_nome === 'Administrador' ? 'admin' : 'user',
          ssoId: id,
          ssoData: JSON.stringify(ssoUserData)
        });
        user = await User.findById(user.id);
      }

      return user;
    } catch (error) {
      console.error('Erro ao sincronizar usuário SSO:', error);
      throw error;
    }
  }

  /**
   * Retorna dados do usuário SSO autenticado
   * GET /api/auth/sso/me
   */
  async getCurrentUser(req, res) {
    try {
      if (!req.session.user) {
        return res.status(401).json({
          success: false,
          message: 'Usuário não autenticado'
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
        message: 'Erro ao obter dados do usuário'
      });
    }
  }

  /**
   * Logout de usuário SSO
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
