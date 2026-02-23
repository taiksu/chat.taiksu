/**
 * Configuração de banco de dados adaptável
 * Suporta SQLite (desenvolvimento) e MySQL (produção)
 */

const path = require('path');
require('dotenv').config();

const dbType = process.env.DB_TYPE || 'sqlite';
const nodeEnv = process.env.NODE_ENV || 'development';

console.log(`📦 Banco de Dados: ${dbType.toUpperCase()} (${nodeEnv})`);

let db;

if (dbType === 'mysql') {
  // ==================== MySQL ====================
  const mysql = require('mysql2/promise');
  
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'chat_taiksu',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  console.log(`✅ MySQL conectado em ${process.env.DB_HOST}:${process.env.DB_PORT}`);

  db = {
    run: async (sql, params = []) => {
      try {
        const conn = await pool.getConnection();
        const result = await conn.execute(sql, params);
        conn.release();
        return { lastID: result[0].insertId, changes: result[0].affectedRows };
      } catch (error) {
        console.error('MySQL run error:', error);
        throw error;
      }
    },

    get: async (sql, params = []) => {
      try {
        const conn = await pool.getConnection();
        const [rows] = await conn.execute(sql, params);
        conn.release();
        return rows[0] || null;
      } catch (error) {
        console.error('MySQL get error:', error);
        throw error;
      }
    },

    all: async (sql, params = []) => {
      try {
        const conn = await pool.getConnection();
        const [rows] = await conn.execute(sql, params);
        conn.release();
        return rows || [];
      } catch (error) {
        console.error('MySQL all error:', error);
        throw error;
      }
    },

    serialize: (callback) => {
      callback();
    },

    exec: async (sql) => {
      try {
        const conn = await pool.getConnection();
        // Executar múltiplas declarações
        const statements = sql.split(';').filter(s => s.trim());
        for (const statement of statements) {
          if (statement.trim()) {
            await conn.execute(statement);
          }
        }
        conn.release();
      } catch (error) {
        console.error('MySQL exec error:', error);
        throw error;
      }
    }
  };
} else {
  // ==================== SQLite ====================
  const sqlite3 = require('sqlite3').verbose();
  const dbPath = path.join(__dirname, 'database.db');

  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('❌ Erro ao conectar ao SQLite:', err);
    } else {
      console.log(`✅ SQLite conectado em ${dbPath}`);
      initializeDatabase();
    }
  });
}

function initializeDatabase() {
  if (dbType === 'sqlite') {
    db.serialize(() => {
      createTables();
    });
  } else {
    createTables();
  }
}

async function createTables() {
  const tables = [
    // Tabela de usuários
    `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT,
        avatar TEXT,
        status TEXT DEFAULT 'offline',
        role TEXT DEFAULT 'user',
        sso_id INTEGER,
        sso_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `,
    // Tabela de salas de chat
    `
      CREATE TABLE IF NOT EXISTS chat_rooms (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT DEFAULT 'support',
        description TEXT,
        owner_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES users(id)
      )
    `,
    // Tabela de mensagens
    `
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        content TEXT,
        type TEXT DEFAULT 'text',
        file_url TEXT,
        file_type TEXT,
        is_read INTEGER DEFAULT 0,
        read_at DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES chat_rooms(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `,
    // Tabela de participantes
    `
      CREATE TABLE IF NOT EXISTS room_participants (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        left_at DATETIME,
        FOREIGN KEY (room_id) REFERENCES chat_rooms(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `,
    // Tabela de métricas
    `
      CREATE TABLE IF NOT EXISTS metrics (
        id TEXT PRIMARY KEY,
        room_id TEXT,
        date DATE,
        messages_count INTEGER DEFAULT 0,
        active_users INTEGER DEFAULT 0,
        avg_response_time INTEGER DEFAULT 0,
        satisfaction_rating REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES chat_rooms(id)
      )
    `,
    // Tabela de status de digitação
    `
      CREATE TABLE IF NOT EXISTS typing_status (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        status INTEGER DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES chat_rooms(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `
  ];

  for (const table of tables) {
    try {
      if (dbType === 'mysql') {
        const conn = await db.pool.getConnection();
        await conn.execute(table);
        conn.release();
      } else {
        await new Promise((resolve, reject) => {
          db.run(table, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
    } catch (error) {
      console.error('Erro ao criar tabela:', error.message);
    }
  }

  console.log('✅ Tabelas criadas/verificadas com sucesso');
}

module.exports = db;
