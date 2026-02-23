const express = require('express');
const SSOController = require('../controllers/SSOController');
const { ssoAuthMiddleware } = require('../middleware/ssoValidation');

const router = express.Router();

// Middleware para validar token SSO do header Authorization
router.use(ssoAuthMiddleware);

// POST /api/auth/sso/validate - Valida token e cria sessão
router.post('/validate', SSOController.validateToken);

// GET /api/auth/sso/me - Retorna dados do usuário autenticado
router.get('/me', SSOController.getCurrentUser);

// POST /api/auth/sso/logout - Faz logout
router.post('/logout', SSOController.logout);

module.exports = router;
