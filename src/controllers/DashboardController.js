const User = require('../models/User');
const ChatRoom = require('../models/ChatRoom');
const Message = require('../models/Message');
const db = require('../config/database');

class DashboardController {
  async index(req, res) {
    try {
      // Contar usuários ativos
      const allUsers = await User.findAll();
      const activeUsers = allUsers.filter(u => u.status === 'online').length;

      // Contar salas
      const rooms = await ChatRoom.findAll();

      // Contar mensagens totais
      db.get(`SELECT COUNT(*) as total FROM messages`, async (err, result) => {
        const totalMessages = result.total;

        // Contar mensagens não lidas
        db.get(`SELECT COUNT(*) as total FROM messages WHERE is_read = 0`, async (err, unreadResult) => {
          const unreadMessages = unreadResult.total;

          // Obter métricas
          db.all(
            `SELECT * FROM metrics ORDER BY date DESC LIMIT 30`,
            (err, metrics) => {
              res.render('dashboard/index', {
                title: 'Dashboard - Chat Taiksu',
                activeUsers,
                totalUsers: allUsers.length,
                totalRooms: rooms.length,
                totalMessages,
                unreadMessages,
                metrics: metrics || [],
                user: req.session.user
              });
            }
          );
        });
      });
    } catch (error) {
      console.error('Dashboard error:', error);
      res.status(500).render('error', { 
        title: 'Erro',
        message: 'Erro ao carregar dashboard',
        user: req.session.user 
      });
    }
  }

  async metrics(req, res) {
    try {
      db.all(
        `SELECT * FROM metrics ORDER BY date DESC LIMIT 30`,
        (err, metrics) => {
          if (err) {
            return res.status(500).json({ error: 'Erro ao buscar métricas' });
          }
          res.json(metrics || []);
        }
      );
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new DashboardController();
