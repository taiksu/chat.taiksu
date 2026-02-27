const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const { ChatQueueModel } = require('./sequelize-models');

class ChatQueue {
  static async getWaitingCount() {
    return ChatQueueModel.count({ where: { status: 'waiting' } });
  }

  static async getWaitingByRoom(roomId) {
    return ChatQueueModel.findOne({
      where: { room_id: roomId, status: 'waiting' },
      raw: true
    });
  }

  static async compactQueuePositions() {
    const waiting = await ChatQueueModel.findAll({
      where: { status: 'waiting' },
      order: [['position', 'ASC'], ['created_at', 'ASC']]
    });
    for (let i = 0; i < waiting.length; i += 1) {
      const row = waiting[i];
      const nextPos = i + 1;
      if (row.position !== nextPos) {
        await ChatQueueModel.update(
          { position: nextPos },
          { where: { id: row.id } }
        );
      }
    }
  }

  static async enqueue({ roomId, userId }) {
    const existing = await this.getWaitingByRoom(roomId);
    if (existing) return existing;

    const count = await this.getWaitingCount();
    const id = uuidv4();
    await ChatQueueModel.create({
      id,
      room_id: roomId,
      user_id: userId,
      status: 'waiting',
      position: count + 1
    });

    return ChatQueueModel.findByPk(id, { raw: true });
  }

  static async getNextWaiting() {
    return ChatQueueModel.findOne({
      where: { status: 'waiting' },
      order: [['position', 'ASC'], ['created_at', 'ASC']],
      raw: true
    });
  }

  static async markAssigned(queueId, agentId) {
    const [changes] = await ChatQueueModel.update(
      {
        status: 'assigned',
        assigned_agent_id: String(agentId || ''),
        assigned_at: new Date(),
        position: 0
      },
      { where: { id: queueId } }
    );
    await this.compactQueuePositions();
    return changes;
  }

  static async cancelWaitingByRoom(roomId) {
    const [changes] = await ChatQueueModel.update(
      { status: 'cancelled', position: 0 },
      {
        where: {
          room_id: roomId,
          status: { [Op.in]: ['waiting'] }
        }
      }
    );
    await this.compactQueuePositions();
    return changes;
  }
}

module.exports = ChatQueue;
