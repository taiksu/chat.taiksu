const User = require('../models/User');
const ChatRoom = require('../models/ChatRoom');
const { Op } = require('sequelize');
const { MetricModel, MessageModel } = require('../models/sequelize-models');

class DashboardController {
  formatDateOnly(date) {
    return new Date(date).toISOString().slice(0, 10);
  }

  getLast30DateKeys() {
    const dates = [];
    const today = new Date();
    for (let i = 29; i >= 0; i -= 1) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      dates.push(this.formatDateOnly(d));
    }
    return dates;
  }

  async buildLast30Metrics() {
    const dateKeys = this.getLast30DateKeys();
    const startDate = dateKeys[0];
    const endDate = dateKeys[dateKeys.length - 1];

    const [messages, persistedMetrics] = await Promise.all([
      MessageModel.findAll({
        attributes: ['user_id', 'created_at'],
        where: {
          created_at: {
            [Op.gte]: `${startDate}T00:00:00.000Z`
          }
        },
        raw: true
      }),
      MetricModel.findAll({
        where: {
          date: {
            [Op.between]: [startDate, endDate]
          }
        },
        raw: true
      })
    ]);

    const persistedByDate = new Map();
    (persistedMetrics || []).forEach((row) => {
      if (row && row.date) persistedByDate.set(String(row.date), row);
    });

    const computed = new Map();
    dateKeys.forEach((key) => {
      computed.set(key, { messages_count: 0, users: new Set() });
    });

    (messages || []).forEach((msg) => {
      const key = this.formatDateOnly(msg.created_at);
      if (!computed.has(key)) return;
      const row = computed.get(key);
      row.messages_count += 1;
      if (msg.user_id) row.users.add(String(msg.user_id));
    });

    return dateKeys.map((date) => {
      const calc = computed.get(date) || { messages_count: 0, users: new Set() };
      const persisted = persistedByDate.get(date) || {};
      return {
        date,
        messages_count: Number(persisted.messages_count ?? calc.messages_count ?? 0),
        active_users: Number(persisted.active_users ?? calc.users.size ?? 0)
      };
    });
  }

  async index(req, res) {
    try {
      const allUsers = await User.findAll();
      const activeUsers = allUsers.filter((u) => u.status === 'online').length;
      const rooms = await ChatRoom.findAll();

      const [totalMessages, unreadMessages] = await Promise.all([
        MessageModel.count(),
        MessageModel.count({ where: { is_read: 0 } })
      ]);

      const metrics = await this.buildLast30Metrics();

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
      const metrics = await this.buildLast30Metrics();
      res.json(metrics || []);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async qaChat(req, res) {
    try {
      const [normalRooms, chamadoRooms, allUsers] = await Promise.all([
        ChatRoom.findAll(),
        ChatRoom.findChamadoRooms(),
        User.findAll()
      ]);

      const merged = new Map();
      [...(normalRooms || []), ...(chamadoRooms || [])].forEach((room) => {
        merged.set(String(room.id), room);
      });

      const detailedRooms = await Promise.all(Array.from(merged.values()).map(async (room) => {
        const participants = await ChatRoom.getParticipants(room.id);
        return {
          id: room.id,
          name: room.name,
          roomType: room.chamado_id ? 'chamado' : 'sala',
          chamadoId: room.chamado_id || null,
          description: room.description || '',
          participants: (participants || []).map((p) => ({
            id: String(p.id),
            name: p.name,
            avatar: p.avatar || '',
            status: p.status || 'offline'
          }))
        };
      }));

      const selectedRoomId = String(req.query.roomId || detailedRooms[0]?.id || '');

      res.render('dashboard/qa-chat', {
        title: 'QA do Chat - Chat Taiksu',
        user: req.session.user,
        rooms: detailedRooms,
        users: (allUsers || []).map((u) => ({
          id: String(u.id),
          name: u.name,
          avatar: u.avatar || '',
          status: u.status || 'offline'
        })),
        selectedRoomId
      });
    } catch (error) {
      console.error('QA chat error:', error);
      res.status(500).render('error', {
        title: 'Erro',
        message: 'Erro ao abrir laboratorio QA',
        user: req.session.user
      });
    }
  }

  async templateLab(req, res) {
    try {
      const [normalRooms, chamadoRooms] = await Promise.all([
        ChatRoom.findAll(),
        ChatRoom.findChamadoRooms()
      ]);

      const merged = new Map();
      [...(normalRooms || []), ...(chamadoRooms || [])].forEach((room) => {
        merged.set(String(room.id), room);
      });

      const rooms = Array.from(merged.values()).map((room) => ({
        id: room.id,
        name: room.name,
        roomType: room.chamado_id ? 'chamado' : 'sala',
        chamadoId: room.chamado_id || null
      }));

      const selectedRoomId = String(req.query.roomId || rooms[0]?.id || '');

      res.render('dashboard/template-lab', {
        title: 'Template Lab - Chat Taiksu',
        user: req.session.user,
        rooms,
        selectedRoomId,
        appUrl: process.env.APP_URL || ''
      });
    } catch (error) {
      console.error('Template lab error:', error);
      res.status(500).render('error', {
        title: 'Erro',
        message: 'Erro ao abrir template lab',
        user: req.session.user
      });
    }
  }
}

module.exports = new DashboardController();
