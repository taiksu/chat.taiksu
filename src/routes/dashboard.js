const express = require('express');
const DashboardController = require('../controllers/DashboardController');

const router = express.Router();

// Middleware de autenticação
const authMiddleware = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/auth/login');
  }
  next();
};

// Rotas do dashboard
router.get('/', authMiddleware, DashboardController.index);
router.get('/metrics', authMiddleware, DashboardController.metrics);

module.exports = router;
