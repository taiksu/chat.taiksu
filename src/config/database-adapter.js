/**
 * Configuracao de banco de dados adaptavel
 * Suporta SQLite (desenvolvimento) e MySQL (producao)
 */

const path = require('path');
require('dotenv').config();

const dbType = process.env.DB_TYPE || 'sqlite';
const nodeEnv = process.env.NODE_ENV || 'development';

console.log(`Banco de Dados: ${dbType.toUpperCase()} (${nodeEnv})`);

let db;

function normalizeParamsAndCallback(params, callback) {
  let parsedParams = params;
  let parsedCallback = callback;

  if (typeof parsedParams === 'function') {
    parsedCallback = parsedParams;
    parsedParams = [];
  }

  if (!Array.isArray(parsedParams)) {
    parsedParams = parsedParams === undefined || parsedParams === null ? [] : [parsedParams];
  }

  return { params: parsedParams, callback: parsedCallback };
}

if (dbType === 'mysql') {
  const mysql = require('mysql2/promise');

  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'chat_taiksu',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  console.log(`MySQL pool criado em ${process.env.DB_HOST}:${process.env.DB_PORT}`);

  db = {
    pool,
    run(sql, params, callback) {
      const normalized = normalizeParamsAndCallback(params, callback);
      const promise = pool.execute(sql, normalized.params)
        .then(([result]) => ({
          lastID: result?.insertId,
          changes: result?.affectedRows || 0
        }));

      if (typeof normalized.callback === 'function') {
        promise
          .then((meta) => normalized.callback.call(meta, null))
          .catch((err) => normalized.callback(err));
        return;
      }

      return promise;
    },
    get(sql, params, callback) {
      const normalized = normalizeParamsAndCallback(params, callback);
      const promise = pool.execute(sql, normalized.params)
        .then(([rows]) => (rows && rows.length ? rows[0] : null));

      if (typeof normalized.callback === 'function') {
        promise
          .then((row) => normalized.callback(null, row))
          .catch((err) => normalized.callback(err));
        return;
      }

      return promise;
    },
    all(sql, params, callback) {
      const normalized = normalizeParamsAndCallback(params, callback);
      const promise = pool.execute(sql, normalized.params)
        .then(([rows]) => rows || []);

      if (typeof normalized.callback === 'function') {
        promise
          .then((rows) => normalized.callback(null, rows))
          .catch((err) => normalized.callback(err));
        return;
      }

      return promise;
    },
    serialize(callback) {
      if (typeof callback === 'function') callback();
    },
    async exec(sql) {
      const conn = await pool.getConnection();
      try {
        const statements = String(sql)
          .split(';')
          .map((s) => s.trim())
          .filter(Boolean);
        for (const statement of statements) {
          await conn.execute(statement);
        }
      } finally {
        conn.release();
      }
    }
  };

  initializeDatabase().catch((error) => {
    console.error('Erro ao inicializar MySQL:', error.message);
  });
} else {
  const sqlite3 = require('sqlite3').verbose();
  const dbPath = path.join(__dirname, 'database.db');

  const sqlite = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Erro ao conectar ao SQLite:', err);
      return;
    }
    console.log(`SQLite conectado em ${dbPath}`);
    initializeDatabase().catch((error) => {
      console.error('Erro ao inicializar SQLite:', error.message);
    });
  });

  db = {
    run(sql, params, callback) {
      const normalized = normalizeParamsAndCallback(params, callback);
      return new Promise((resolve, reject) => {
        sqlite.run(sql, normalized.params, function(err) {
          if (typeof normalized.callback === 'function') {
            normalized.callback.call(this, err || null);
          }
          if (err) return reject(err);
          resolve({ lastID: this.lastID, changes: this.changes || 0 });
        });
      });
    },
    get(sql, params, callback) {
      const normalized = normalizeParamsAndCallback(params, callback);
      return new Promise((resolve, reject) => {
        sqlite.get(sql, normalized.params, (err, row) => {
          if (typeof normalized.callback === 'function') {
            normalized.callback(err || null, row);
          }
          if (err) return reject(err);
          resolve(row || null);
        });
      });
    },
    all(sql, params, callback) {
      const normalized = normalizeParamsAndCallback(params, callback);
      return new Promise((resolve, reject) => {
        sqlite.all(sql, normalized.params, (err, rows) => {
          if (typeof normalized.callback === 'function') {
            normalized.callback(err || null, rows);
          }
          if (err) return reject(err);
          resolve(rows || []);
        });
      });
    },
    serialize(callback) {
      sqlite.serialize(() => {
        if (typeof callback === 'function') callback();
      });
    },
    exec(sql) {
      return new Promise((resolve, reject) => {
        sqlite.exec(sql, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    }
  };
}

async function initializeDatabase() {
  await createTables();
}

async function createTables() {
  const tables = [
    `
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255),
        avatar TEXT,
        status VARCHAR(32) DEFAULT 'offline',
        role VARCHAR(32) DEFAULT 'user',
        attendance_state VARCHAR(32) DEFAULT 'livre',
        sso_id BIGINT,
        sso_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS chat_rooms (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(64) DEFAULT 'support',
        status VARCHAR(32) DEFAULT 'aberto',
        chat_state VARCHAR(32) DEFAULT 'NEW',
        assigned_agent_id VARCHAR(64),
        description TEXT,
        owner_id VARCHAR(64) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES users(id)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS chat_queue (
        id VARCHAR(64) PRIMARY KEY,
        room_id VARCHAR(64) NOT NULL,
        user_id VARCHAR(64) NOT NULL,
        status VARCHAR(32) DEFAULT 'waiting',
        position INTEGER DEFAULT 1,
        assigned_agent_id VARCHAR(64),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        assigned_at DATETIME,
        FOREIGN KEY (room_id) REFERENCES chat_rooms(id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (assigned_agent_id) REFERENCES users(id)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS messages (
        id VARCHAR(64) PRIMARY KEY,
        room_id VARCHAR(64) NOT NULL,
        user_id VARCHAR(64) NOT NULL,
        content TEXT,
        type VARCHAR(32) DEFAULT 'text',
        file_url TEXT,
        file_type VARCHAR(255),
        actions TEXT,
        feedback_value VARCHAR(8),
        feedback_at DATETIME,
        feedback_by VARCHAR(64),
        reaction_emoji VARCHAR(32),
        reaction_at DATETIME,
        reaction_by VARCHAR(64),
        is_read INTEGER DEFAULT 0,
        read_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES chat_rooms(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS room_participants (
        id VARCHAR(64) PRIMARY KEY,
        room_id VARCHAR(64) NOT NULL,
        user_id VARCHAR(64) NOT NULL,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        left_at DATETIME,
        FOREIGN KEY (room_id) REFERENCES chat_rooms(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS metrics (
        id VARCHAR(64) PRIMARY KEY,
        room_id VARCHAR(64),
        date DATE,
        messages_count INTEGER DEFAULT 0,
        active_users INTEGER DEFAULT 0,
        avg_response_time INTEGER DEFAULT 0,
        satisfaction_rating DECIMAL(5,2),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES chat_rooms(id)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS support_chamados_rooms (
        id VARCHAR(64) PRIMARY KEY,
        chamado_id VARCHAR(64) NOT NULL UNIQUE,
        room_id VARCHAR(64) NOT NULL UNIQUE,
        created_by VARCHAR(64) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES chat_rooms(id),
        FOREIGN KEY (created_by) REFERENCES users(id)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS external_client_rooms (
        id VARCHAR(64) PRIMARY KEY,
        client_app_id VARCHAR(120) NOT NULL,
        client_user_id VARCHAR(120) NOT NULL,
        room_id VARCHAR(64) NOT NULL UNIQUE,
        created_by VARCHAR(64) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (client_user_id),
        FOREIGN KEY (room_id) REFERENCES chat_rooms(id),
        FOREIGN KEY (created_by) REFERENCES users(id)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS typing_status (
        id VARCHAR(64) PRIMARY KEY,
        room_id VARCHAR(64) NOT NULL,
        user_id VARCHAR(64) NOT NULL,
        status INTEGER DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES chat_rooms(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `
  ];

  for (const tableSql of tables) {
    try {
      await db.run(tableSql);
    } catch (error) {
      console.error('Erro ao criar tabela:', error.message);
    }
  }

  console.log('Tabelas criadas/verificadas com sucesso');
}

module.exports = db;
