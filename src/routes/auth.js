const express = require('express');
const AuthController = require('../controllers/AuthController');

const router = express.Router();

// Rotas de autenticacao
router.get('/login', AuthController.showLogin.bind(AuthController));
router.get('/register', AuthController.showRegister.bind(AuthController));
router.post('/register', AuthController.register.bind(AuthController));
router.post('/login', AuthController.login.bind(AuthController));
router.get('/logout', AuthController.logout.bind(AuthController));

module.exports = router;
