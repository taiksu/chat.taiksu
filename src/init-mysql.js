/**
 * Script para inicializar MySQL e criar banco de dados
 * Uso: node src/init-mysql.js
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

async function initMySQL() {
  console.log('Inicializando MySQL para Chat Taiksu');
  console.log('='.repeat(50));

  const dbName = process.env.DB_NAME || 'chat_taiksu';
  const dbUser = process.env.DB_USER || 'root';
  const dbPassword = process.env.DB_PASSWORD || '';
  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = Number(process.env.DB_PORT || 3306);

  try {
    console.log(`Conectando ao MySQL em ${dbHost}:${dbPort}...`);
    const connection = await mysql.createConnection({
      host: dbHost,
      port: dbPort,
      user: dbUser,
      password: dbPassword || undefined
    });

    await connection.execute(`DROP DATABASE IF EXISTS ${dbName}`);
    await connection.execute(`CREATE DATABASE ${dbName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`Banco '${dbName}' pronto`);

    const db = await mysql.createConnection({
      host: dbHost,
      port: dbPort,
      user: dbUser,
      password: dbPassword || undefined,
      database: dbName
    });

    await db.execute(`
      CREATE TABLE users (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255),
        avatar LONGTEXT,
        status VARCHAR(20) DEFAULT 'offline',
        role VARCHAR(20) DEFAULT 'user',
        attendance_state VARCHAR(32) DEFAULT 'livre',
        sso_id INT,
        sso_data LONGTEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await db.execute(`
      CREATE TABLE chat_rooms (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(20) DEFAULT 'support',
        status VARCHAR(32) DEFAULT 'aberto',
        chat_state VARCHAR(32) DEFAULT 'NEW',
        assigned_agent_id VARCHAR(36),
        description TEXT,
        owner_id VARCHAR(36) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_owner (owner_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await db.execute(`
      CREATE TABLE messages (
        id VARCHAR(36) PRIMARY KEY,
        room_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        content LONGTEXT,
        type VARCHAR(20) DEFAULT 'text',
        file_url LONGTEXT,
        file_type VARCHAR(50),
        actions LONGTEXT,
        feedback_value VARCHAR(8),
        feedback_at DATETIME,
        feedback_by VARCHAR(36),
        is_read TINYINT DEFAULT 0,
        read_at DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_room (room_id),
        INDEX idx_user (user_id),
        INDEX idx_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await db.execute(`
      CREATE TABLE room_participants (
        id VARCHAR(36) PRIMARY KEY,
        room_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        left_at DATETIME,
        FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_participant (room_id, user_id),
        INDEX idx_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await db.execute(`
      CREATE TABLE metrics (
        id VARCHAR(36) PRIMARY KEY,
        room_id VARCHAR(36),
        date DATE,
        messages_count INT DEFAULT 0,
        active_users INT DEFAULT 0,
        avg_response_time INT DEFAULT 0,
        satisfaction_rating FLOAT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
        INDEX idx_date (date),
        INDEX idx_room (room_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await db.execute(`
      CREATE TABLE support_chamados_rooms (
        id VARCHAR(36) PRIMARY KEY,
        chamado_id VARCHAR(64) NOT NULL UNIQUE,
        room_id VARCHAR(36) NOT NULL UNIQUE,
        created_by VARCHAR(36) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await db.execute(`
      CREATE TABLE typing_status (
        id VARCHAR(36) PRIMARY KEY,
        room_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        status TINYINT DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_typing (room_id, user_id),
        INDEX idx_room (room_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await db.execute(`
      CREATE TABLE chat_queue (
        id VARCHAR(36) PRIMARY KEY,
        room_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        status VARCHAR(32) DEFAULT 'waiting',
        position INT DEFAULT 1,
        assigned_agent_id VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        assigned_at DATETIME,
        FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (assigned_agent_id) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_queue_status_position (status, position)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('Tabelas criadas com sucesso');
    await connection.end();
    await db.end();
    process.exit(0);
  } catch (error) {
    console.error('Erro ao inicializar MySQL:', error.message);
    process.exit(1);
  }
}

initMySQL();
