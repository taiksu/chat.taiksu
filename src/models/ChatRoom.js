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
      db.all(`SELECT * FROM chat_rooms ORDER BY created_at DESC`, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
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
      const id = uuidv4();
      db.run(
        `INSERT INTO room_participants (id, room_id, user_id)
         VALUES (?, ?, ?)`,
        [id, roomId, userId],
        function(err) {
          if (err) reject(err);
          else resolve({ id, roomId, userId });
        }
      );
    });
  }

  static getParticipants(roomId) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT u.* FROM users u
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
}

module.exports = ChatRoom;
