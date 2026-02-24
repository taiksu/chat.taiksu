const { v4: uuidv4 } = require('uuid');
const { QueryTypes } = require('sequelize');
const {
  sequelize,
  ChatRoomModel,
  RoomParticipantModel,
  SupportChamadoRoomModel,
  MessageModel,
  TypingStatusModel
} = require('./sequelize-models');

class ChatRoom {
  static async create(roomData) {
    const id = uuidv4();
    const created = await ChatRoomModel.create({
      id,
      name: roomData.name,
      type: roomData.type || 'support',
      description: roomData.description || '',
      owner_id: roomData.ownerId
    });

    return {
      id: created.id,
      name: created.name,
      type: created.type,
      description: created.description,
      owner_id: created.owner_id,
      created_at: created.created_at,
      updated_at: created.updated_at
    };
  }

  static async findById(id) {
    return ChatRoomModel.findByPk(id, { raw: true });
  }

  static async findAll() {
    return sequelize.query(
      `SELECT cr.*
       FROM chat_rooms cr
       LEFT JOIN support_chamados_rooms scr ON scr.room_id = cr.id
       WHERE scr.room_id IS NULL
       ORDER BY cr.created_at DESC`,
      { type: QueryTypes.SELECT }
    );
  }

  static async findByOwnerId(ownerId) {
    return ChatRoomModel.findAll({
      where: { owner_id: ownerId },
      order: [['created_at', 'DESC']],
      raw: true
    });
  }

  static async addParticipant(roomId, userId) {
    const existing = await RoomParticipantModel.findOne({
      where: { room_id: roomId, user_id: userId, left_at: null },
      raw: true
    });

    if (existing) {
      return { id: existing.id, roomId, userId, existing: true };
    }

    const id = uuidv4();
    await RoomParticipantModel.create({
      id,
      room_id: roomId,
      user_id: userId,
      joined_at: new Date(),
      left_at: null
    });

    return { id, roomId, userId, existing: false };
  }

  static async hasActiveParticipant(roomId, userId) {
    const row = await RoomParticipantModel.findOne({
      where: { room_id: roomId, user_id: userId, left_at: null },
      attributes: ['id'],
      raw: true
    });
    return Boolean(row);
  }

  static async getParticipants(roomId) {
    return sequelize.query(
      `SELECT DISTINCT u.*
       FROM users u
       JOIN room_participants rp ON u.id = rp.user_id
       WHERE rp.room_id = :roomId AND rp.left_at IS NULL`,
      {
        replacements: { roomId },
        type: QueryTypes.SELECT
      }
    );
  }

  static async removeParticipant(roomId, userId) {
    const [changes] = await RoomParticipantModel.update(
      { left_at: new Date() },
      { where: { room_id: roomId, user_id: userId, left_at: null } }
    );
    return changes;
  }

  static async findByChamadoId(chamadoId) {
    const rows = await sequelize.query(
      `SELECT cr.*, scr.chamado_id
       FROM support_chamados_rooms scr
       JOIN chat_rooms cr ON cr.id = scr.room_id
       WHERE scr.chamado_id = :chamadoId
       LIMIT 1`,
      {
        replacements: { chamadoId: String(chamadoId) },
        type: QueryTypes.SELECT
      }
    );
    return rows[0] || null;
  }

  static async findChamadoRooms() {
    return sequelize.query(
      `SELECT cr.*, scr.chamado_id
       FROM support_chamados_rooms scr
       JOIN chat_rooms cr ON cr.id = scr.room_id
       ORDER BY cr.created_at DESC`,
      { type: QueryTypes.SELECT }
    );
  }

  static async createOrGetChamadoRoom({ chamadoId, ownerId, name, description }) {
    const existing = await this.findByChamadoId(chamadoId);
    if (existing) return { room: existing, created: false };

    return sequelize.transaction(async (transaction) => {
      const roomId = uuidv4();
      const createdRoom = await ChatRoomModel.create({
        id: roomId,
        name: name || `Chamado #${chamadoId}`,
        type: 'support_ticket',
        description: description || `Conversa do chamado ${chamadoId}`,
        owner_id: ownerId
      }, { transaction });

      await SupportChamadoRoomModel.create({
        id: uuidv4(),
        chamado_id: String(chamadoId),
        room_id: createdRoom.id,
        created_by: ownerId,
        created_at: new Date()
      }, { transaction });

      return {
        room: {
          ...createdRoom.get({ plain: true }),
          chamado_id: String(chamadoId)
        },
        created: true
      };
    });
  }

  static async deleteById(roomId) {
    return sequelize.transaction(async (transaction) => {
      await SupportChamadoRoomModel.destroy({ where: { room_id: roomId }, transaction });
      await TypingStatusModel.destroy({ where: { room_id: roomId }, transaction });
      await RoomParticipantModel.destroy({ where: { room_id: roomId }, transaction });
      await MessageModel.destroy({ where: { room_id: roomId }, transaction });
      return ChatRoomModel.destroy({ where: { id: roomId }, transaction });
    });
  }

  static async getRoomStatus(roomId) {
    try {
      const room = await ChatRoomModel.findByPk(roomId, { raw: true });
      if (!room) {
        return {
          roomId,
          status: 'not_found',
          isReadOnly: true,
          message: 'Sala não encontrada'
        };
      }

      const isClosed = String(room.status).toLowerCase() === 'closed';
      return {
        roomId,
        status: room.status || 'open',
        isReadOnly: isClosed,
        message: isClosed ? 'Este chamado foi fechado. Você pode visualizar o histórico, mas não pode enviar novas mensagens.' : null
      };
    } catch (error) {
      console.error('Erro ao obter status da room:', error);
      return {
        roomId,
        status: 'error',
        isReadOnly: true,
        message: 'Erro ao verificar status da sala'
      };
    }
  }

  static async closeRoom(roomId) {
    try {
      await ChatRoomModel.update(
        { status: 'closed' },
        { where: { id: roomId } }
      );
      return { success: true, status: 'closed' };
    } catch (error) {
      console.error('Erro ao fechar room:', error);
      return { success: false, error: error.message };
    }
  }

  static async reopenRoom(roomId) {
    try {
      await ChatRoomModel.update(
        { status: 'open' },
        { where: { id: roomId } }
      );
      return { success: true, status: 'open' };
    } catch (error) {
      console.error('Erro ao reabrir room:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = ChatRoom;
