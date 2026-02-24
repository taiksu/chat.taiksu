const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class ChatRoom {
  static create(roomData) {
    return new Promise((resolve, reject) => {
      const id = uuidv4();
      const { name, type, description, ownerId } = roomData;
      
      db.run(
        `INSERT INTO chat_rooms (id, name, type, description, owner_id)
         VALUES (?, ?, ?, ?, ?)`,
        [id, name, type || 'support', description || '', ownerId],
        function(err) {
          if (err) reject(err);
          else resolve({ id, ...roomData });
        }
      );
    });
  }

  static findById(id) {
    return new Promise((resolve, reject) => {
      db.get(`SELECT * FROM chat_rooms WHERE id = ?`, [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  static findAll() {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT cr.*
         FROM chat_rooms cr
         LEFT JOIN support_chamados_rooms scr ON scr.room_id = cr.id
         WHERE scr.room_id IS NULL
         ORDER BY cr.created_at DESC`,
        [],
        (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
        }
      );
    });
  }

  static findByOwnerId(ownerId) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM chat_rooms WHERE owner_id = ? ORDER BY created_at DESC`,
        [ownerId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  static addParticipant(roomId, userId) {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT id FROM room_participants
         WHERE room_id = ? AND user_id = ? AND left_at IS NULL
         LIMIT 1`,
        [roomId, userId],
        (findErr, existing) => {
          if (findErr) return reject(findErr);
          if (existing) return resolve({ id: existing.id, roomId, userId, existing: true });

          const id = uuidv4();
          db.run(
            `INSERT INTO room_participants (id, room_id, user_id)
             VALUES (?, ?, ?)`,
            [id, roomId, userId],
            function(err) {
              if (err) reject(err);
              else resolve({ id, roomId, userId, existing: false });
            }
          );
        }
      );
    });
  }

  static getParticipants(roomId) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT DISTINCT u.* FROM users u
         JOIN room_participants rp ON u.id = rp.user_id
         WHERE rp.room_id = ? AND rp.left_at IS NULL`,
        [roomId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  static removeParticipant(roomId, userId) {
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE room_participants SET left_at = CURRENT_TIMESTAMP
         WHERE room_id = ? AND user_id = ?`,
        [roomId, userId],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  static findByChamadoId(chamadoId) {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT cr.*, scr.chamado_id
         FROM support_chamados_rooms scr
         JOIN chat_rooms cr ON cr.id = scr.room_id
         WHERE scr.chamado_id = ?`,
        [String(chamadoId)],
        (err, row) => {
          if (err) reject(err);
          else resolve(row || null);
        }
      );
    });
  }

  static findChamadoRooms() {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT cr.*, scr.chamado_id
         FROM support_chamados_rooms scr
         JOIN chat_rooms cr ON cr.id = scr.room_id
         ORDER BY cr.created_at DESC`,
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  static async createOrGetChamadoRoom({ chamadoId, ownerId, name, description }) {
    const existing = await this.findByChamadoId(chamadoId);
    if (existing) {
      return { room: existing, created: false };
    }

    const room = await this.create({
      name: name || `Chamado #${chamadoId}`,
      type: 'support_ticket',
      description: description || `Conversa do chamado ${chamadoId}`,
      ownerId
    });

    const mappingId = uuidv4();
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO support_chamados_rooms (id, chamado_id, room_id, created_by)
         VALUES (?, ?, ?, ?)`,
        [mappingId, String(chamadoId), room.id, ownerId],
        function(err) {
          if (err) reject(err);
          else resolve(this);
        }
      );
    });

    return { room: { ...room, chamado_id: String(chamadoId) }, created: true };
  }
}

module.exports = ChatRoom;
