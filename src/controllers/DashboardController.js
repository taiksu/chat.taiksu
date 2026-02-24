const User = require('../models/User');
const ChatRoom = require('../models/ChatRoom');
const { MetricModel, MessageModel } = require('../models/sequelize-models');

class DashboardController {
  async index(req, res) {
    try {
      const allUsers = await User.findAll();
      const activeUsers = allUsers.filter((u) => u.status === 'online').length;
      const rooms = await ChatRoom.findAll();

      const [totalMessages, unreadMessages] = await Promise.all([
        MessageModel.count(),
        MessageModel.count({ where: { is_read: 0 } })
      ]);

      const metrics = await MetricModel.findAll({
        order: [['date', 'DESC']],
        limit: 30,
        raw: true
      });

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
      const metrics = await MetricModel.findAll({
        order: [['date', 'DESC']],
        limit: 30,
        raw: true
      });
      res.json(metrics || []);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new DashboardController();
