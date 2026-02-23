const express = require('express');
const AuthController = require('../controllers/AuthController');

const router = express.Router();

// Rotas de autenticação
router.get('/login', AuthController.showLogin);
router.get('/register', AuthController.showRegister);
router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.get('/logout', AuthController.logout);

module.exports = router;
