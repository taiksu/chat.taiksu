const { v4: uuidv4 } = require('uuid');
const { QueryTypes } = require('sequelize');
const {
  sequelize,
  ChatRoomModel,
  RoomParticipantModel,
  SupportChamadoRoomModel,
  ExternalClientRoomModel,
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
      status: roomData.status || 'aberto',
      chat_state: roomData.chatState || 'NEW',
      assigned_agent_id: roomData.assignedAgentId || null,
      description: roomData.description || '',
      owner_id: roomData.ownerId
    });

    return {
      id: created.id,
      name: created.name,
      type: created.type,
      status: created.status,
      chat_state: created.chat_state,
      assigned_agent_id: created.assigned_agent_id,
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
      await ExternalClientRoomModel.destroy({ where: { room_id: roomId }, transaction });
      await TypingStatusModel.destroy({ where: { room_id: roomId }, transaction });
      await RoomParticipantModel.destroy({ where: { room_id: roomId }, transaction });
      await MessageModel.destroy({ where: { room_id: roomId }, transaction });
      return ChatRoomModel.destroy({ where: { id: roomId }, transaction });
    });
  }

  static async findByExternalClient(clientAppId, clientUserId) {
    const rows = await sequelize.query(
      `SELECT cr.*, ecr.client_app_id, ecr.client_user_id
       FROM external_client_rooms ecr
       JOIN chat_rooms cr ON cr.id = ecr.room_id
       WHERE ecr.client_app_id = :clientAppId
         AND ecr.client_user_id = :clientUserId
       LIMIT 1`,
      {
        replacements: {
          clientAppId: String(clientAppId || ''),
          clientUserId: String(clientUserId || '')
        },
        type: QueryTypes.SELECT
      }
    );
    return rows[0] || null;
  }

  static async createOrGetExternalClientRoom({
    clientAppId,
    clientUserId,
    ownerId,
    name,
    description
  }) {
    const safeApp = String(clientAppId || '').trim();
    const safeUser = String(clientUserId || '').trim();
    if (!safeApp || !safeUser) {
      throw new Error('clientAppId e clientUserId sao obrigatorios');
    }

    const existing = await this.findByExternalClient(safeApp, safeUser);
    if (existing) {
      const status = String(existing.status || '').trim().toLowerCase();
      const isClosed = ['fechado', 'closed', 'concluido', 'concluído', 'finalizado', 'resolved', 'resolvido'].includes(status);
      if (!isClosed) return { room: existing, created: false, reopened: false };

      await ChatRoomModel.update(
        {
          status: 'aberto',
          chat_state: 'NEW',
          assigned_agent_id: null
        },
        { where: { id: String(existing.id) } }
      );
      const reopenedRoom = await this.findByExternalClient(safeApp, safeUser);
      return { room: reopenedRoom || existing, created: false, reopened: true };
    }

    return sequelize.transaction(async (transaction) => {
      const roomId = uuidv4();
      const createdRoom = await ChatRoomModel.create({
        id: roomId,
        name: name || `Cliente ${safeUser}`,
        type: 'external_client',
        description: description || `Atendimento do app ${safeApp} para usuario ${safeUser}`,
        owner_id: ownerId
      }, { transaction });

      await ExternalClientRoomModel.create({
        id: uuidv4(),
        client_app_id: safeApp,
        client_user_id: safeUser,
        room_id: createdRoom.id,
        created_by: ownerId,
        created_at: new Date()
      }, { transaction });

      return {
        room: {
          ...createdRoom.get({ plain: true }),
          client_app_id: safeApp,
          client_user_id: safeUser
        },
        created: true,
        reopened: false
      };
    });
  }

  static async findPendingHumanRooms(limit = 20) {
    return sequelize.query(
      `SELECT cr.*, scr.chamado_id
       FROM chat_rooms cr
       LEFT JOIN support_chamados_rooms scr ON scr.room_id = cr.id
       WHERE UPPER(COALESCE(cr.chat_state, 'NEW')) IN ('AGUARDANDO_HUMANO', 'FILA')
         AND LOWER(COALESCE(cr.status, 'aberto')) NOT IN ('fechado', 'closed', 'concluido', 'concluído', 'finalizado', 'resolved')
       ORDER BY cr.updated_at ASC
       LIMIT :limit`,
      {
        replacements: { limit: Number(limit || 20) },
        type: QueryTypes.SELECT
      }
    );
  }

  static async updateStatus(roomId, status) {
    const [changes] = await ChatRoomModel.update(
      { status: String(status || '').trim() || 'aberto' },
      { where: { id: roomId } }
    );
    return changes;
  }

  static async updateChamadoStatus(chamadoId, status) {
    const room = await this.findByChamadoId(chamadoId);
    if (!room) return null;
    await this.updateStatus(room.id, status);
    return this.findByChamadoId(chamadoId);
  }

  static async updateChatState(roomId, chatState) {
    const [changes] = await ChatRoomModel.update(
      { chat_state: String(chatState || '').trim() || 'NEW' },
      { where: { id: roomId } }
    );
    return changes;
  }

  static async setAssignedAgent(roomId, agentId) {
    const [changes] = await ChatRoomModel.update(
      { assigned_agent_id: agentId ? String(agentId) : null },
      { where: { id: roomId } }
    );
    return changes;
  }
}

module.exports = ChatRoom;
