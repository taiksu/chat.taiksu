const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const { MessageModel, UserModel } = require('./sequelize-models');

class Message {
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
      is_read: 0
    });

    return {
      id: created.id,
      roomId: created.room_id,
      userId: created.user_id,
      content: created.content,
      type: created.type,
      fileUrl: created.file_url,
      fileType: created.file_type
    };
  }

  static async findById(id) {
    return MessageModel.findByPk(id, { raw: true });
  }

  static async findByRoomId(roomId, limit = 50) {
    const rows = await MessageModel.findAll({
      where: { room_id: roomId },
      include: [{ model: UserModel, as: 'sender', attributes: ['name', 'avatar'] }],
      order: [['created_at', 'DESC']],
      limit: Number(limit)
    });

    return rows
      .map((row) => {
        const plain = row.get({ plain: true });
        return {
          ...plain,
          name: plain.sender?.name || null,
          avatar: plain.sender?.avatar || null
        };
      })
      .reverse();
  }

  static async markAsRead(messageId) {
    const [changes] = await MessageModel.update(
      { is_read: 1, read_at: new Date() },
      { where: { id: messageId } }
    );
    return changes;
  }

  static async markRoomAsRead(roomId, userId) {
    const [changes] = await MessageModel.update(
      { is_read: 1, read_at: new Date() },
      {
        where: {
          room_id: roomId,
          user_id: { [Op.ne]: userId }
        }
      }
    );
    return changes;
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
}

module.exports = Message;
