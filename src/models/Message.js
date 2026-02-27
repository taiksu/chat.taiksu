const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const { MessageModel, UserModel } = require('./sequelize-models');

class Message {
  static parseActions(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch (_err) {
        return [];
      }
    }
    return [];
  }

  static serializeActions(actions) {
    if (!Array.isArray(actions) || !actions.length) return null;
    return JSON.stringify(actions);
  }

  static async create(messageData) {
    const id = uuidv4();
    const created = await MessageModel.create({
      id,
      room_id: messageData.roomId,
      user_id: messageData.userId,
      content: messageData.content || '',
      type: messageData.type || 'text',
      file_url: messageData.fileUrl || null,
      file_type: messageData.fileType || null,
      actions: this.serializeActions(messageData.actions),
      is_read: 0
    });

    return {
      id: created.id,
      roomId: created.room_id,
      userId: created.user_id,
      content: created.content,
      type: created.type,
      fileUrl: created.file_url,
      fileType: created.file_type,
      actions: this.parseActions(created.actions),
      feedbackValue: created.feedback_value || null,
      feedbackAt: created.feedback_at || null,
      feedbackBy: created.feedback_by || null
    };
  }

  static async findById(id) {
    return MessageModel.findByPk(id, { raw: true });
  }

  static async findByRoomId(roomId, limit = 50) {
    const rows = await MessageModel.findAll({
      where: { room_id: roomId },
      include: [{ model: UserModel, as: 'sender', attributes: ['name', 'avatar', 'role'] }],
      order: [['created_at', 'DESC']],
      limit: Number(limit)
    });

    return rows
      .map((row) => {
        const plain = row.get({ plain: true });
        return {
          ...plain,
          name: plain.sender?.name || null,
          avatar: plain.sender?.avatar || null,
          sender_role: plain.sender?.role || null,
          is_ai: String(plain.sender?.role || '').toLowerCase() === 'system',
          feedback_value: plain.feedback_value || null,
          feedback_at: plain.feedback_at || null,
          feedback_by: plain.feedback_by || null,
          actions: this.parseActions(plain.actions)
        };
      })
      .reverse();
  }

  static async setFeedback({ messageId, value, userId }) {
    const normalized = String(value || '').toLowerCase();
    if (!['up', 'down'].includes(normalized)) {
      throw new Error('feedback_value_invalid');
    }

    const [changes] = await MessageModel.update(
      {
        feedback_value: normalized,
        feedback_at: new Date(),
        feedback_by: userId ? String(userId) : null
      },
      { where: { id: messageId } }
    );
    return changes;
  }

  static async markAsRead(messageId) {
    const [changes] = await MessageModel.update(
      { is_read: 1, read_at: new Date() },
      { where: { id: messageId } }
    );
    return changes;
  }

  static async markRoomAsRead(roomId, userId) {
    const unreadRows = await MessageModel.findAll({
      where: {
        room_id: roomId,
        user_id: { [Op.ne]: userId },
        is_read: 0
      },
      attributes: ['id'],
      raw: true
    });

    const messageIds = unreadRows.map((row) => row.id);
    if (!messageIds.length) {
      return { count: 0, messageIds: [] };
    }

    const [changes] = await MessageModel.update(
      { is_read: 1, read_at: new Date() },
      {
        where: {
          id: { [Op.in]: messageIds }
        }
      }
    );
    return { count: changes, messageIds };
  }

  static async countUnread(roomId) {
    return MessageModel.count({
      where: { room_id: roomId, is_read: 0 }
    });
  }

  static async findAttachmentsByRoomId(roomId) {
    return MessageModel.findAll({
      where: {
        room_id: roomId,
        file_url: { [Op.ne]: null }
      },
      attributes: ['id', 'file_url'],
      raw: true
    });
  }

  static async deleteByRoomId(roomId) {
    return MessageModel.destroy({ where: { room_id: roomId } });
  }

  static async delete(messageId) {
    return MessageModel.destroy({ where: { id: messageId } });
  }

  static async getLastMessageAt(roomId) {
    const row = await MessageModel.findOne({
      where: { room_id: roomId },
      attributes: ['created_at'],
      order: [['created_at', 'DESC']],
      raw: true
    });
    return row?.created_at || null;
  }
}

module.exports = Message;
