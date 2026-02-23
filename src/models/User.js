const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class User {
  static create(userData) {
    return new Promise((resolve, reject) => {
      const id = uuidv4();
      const { name, email, password, avatar, role } = userData;
      
      db.run(
        `INSERT INTO users (id, name, email, password, avatar, role) VALUES (?, ?, ?, ?, ?, ?)`,
        [id, name, email, password, avatar || null, role || 'user'],
        function(err) {
          if (err) reject(err);
          else resolve({ id, ...userData });
        }
      );
    });
  }

  static findById(id) {
    return new Promise((resolve, reject) => {
      db.get(`SELECT * FROM users WHERE id = ?`, [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  static findByEmail(email) {
    return new Promise((resolve, reject) => {
      db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  static findAll() {
    return new Promise((resolve, reject) => {
      db.all(`SELECT * FROM users`, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  static updateStatus(userId, status) {
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [status, userId],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  static updateAvatar(userId, avatarUrl) {
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE users SET avatar = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [avatarUrl, userId],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  static update(userId, updateData) {
    return new Promise((resolve, reject) => {
      const { name, avatar, role, ssoId, ssoData } = updateData;
      
      db.run(
        `UPDATE users SET 
          name = COALESCE(?, name),
          avatar = COALESCE(?, avatar),
          role = COALESCE(?, role),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [name || null, avatar || null, role || null, userId],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  static findBySSOId(ssoId) {
    return new Promise((resolve, reject) => {
      db.get(`SELECT * FROM users WHERE sso_id = ?`, [ssoId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }
}

module.exports = User;
