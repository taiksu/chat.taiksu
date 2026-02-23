const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class Message {
  static create(messageData) {
    return new Promise((resolve, reject) => {
      const id = uuidv4();
      const { roomId, userId, content, type, fileUrl, fileType } = messageData;
      
      db.run(
        `INSERT INTO messages (id, room_id, user_id, content, type, file_url, file_type)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, roomId, userId, content || '', type || 'text', fileUrl || null, fileType || null],
        function(err) {
          if (err) reject(err);
          else resolve({ id, roomId, userId, ...messageData });
        }
      );
    });
  }

  static findById(id) {
    return new Promise((resolve, reject) => {
      db.get(`SELECT * FROM messages WHERE id = ?`, [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  static findByRoomId(roomId, limit = 50) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT m.*, u.name, u.avatar FROM messages m
         JOIN users u ON m.user_id = u.id
         WHERE m.room_id = ?
         ORDER BY m.created_at DESC
         LIMIT ?`,
        [roomId, limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve((rows || []).reverse());
        }
      );
    });
  }

  static markAsRead(messageId) {
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE messages SET is_read = 1, read_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [messageId],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  static markRoomAsRead(roomId, userId) {
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE messages SET is_read = 1, read_at = CURRENT_TIMESTAMP 
         WHERE room_id = ? AND user_id != ?`,
        [roomId, userId],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  static countUnread(roomId) {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT COUNT(*) as count FROM messages WHERE room_id = ? AND is_read = 0`,
        [roomId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        }
      );
    });
  }

  static delete(messageId) {
    return new Promise((resolve, reject) => {
      db.run(`DELETE FROM messages WHERE id = ?`, [messageId], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }
}

module.exports = Message;
