/**
 * Script para inicializar MySQL e criar banco de dados
 * Uso: node src/init-mysql.js
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

async function initMySQL() {
  console.log('🚀 Inicializando MySQL para Chat Taiksu');
  console.log('═'.repeat(50));

  const dbName = process.env.DB_NAME || 'chat_taiksu';
  const dbUser = process.env.DB_USER || 'root';
  const dbPassword = process.env.DB_PASSWORD || '';
  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = process.env.DB_PORT || 3306;

  try {
    // Conectar sem especificar banco de dados
    console.log(`\n📡 Conectando ao MySQL em ${dbHost}:${dbPort}...`);
    const connection = await mysql.createConnection({
      host: dbHost,
      port: dbPort,
      user: dbUser,
      password: dbPassword || undefined
    });

    console.log('✅ Conectado ao MySQL!');

    // Criar banco de dados
    console.log(`\n📁 Criando banco de dados '${dbName}'...`);
    try {
      await connection.execute(`DROP DATABASE IF EXISTS ${dbName}`);
      console.log('🗑️  Banco anterior removido');
    } catch (e) {
      // Ignorar se não existir
    }

    await connection.execute(`CREATE DATABASE ${dbName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`✅ Banco de dados '${dbName}' criado!`);

    // Conectar ao novo banco
    const db = await mysql.createConnection({
      host: dbHost,
      port: dbPort,
      user: dbUser,
      password: dbPassword || undefined,
      database: dbName
    });

    console.log(`\n📊 Criando tabelas...`);

    // Tabela de usuários
    await db.execute(`
      CREATE TABLE users (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255),
        avatar LONGTEXT,
        status VARCHAR(20) DEFAULT 'offline',
        role VARCHAR(20) DEFAULT 'user',
        sso_id INT,
        sso_data LONGTEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  ✅ Tabela: users');

    // Tabela de salas de chat
    await db.execute(`
      CREATE TABLE chat_rooms (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(20) DEFAULT 'support',
        description TEXT,
        owner_id VARCHAR(36) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_owner (owner_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  ✅ Tabela: chat_rooms');

    // Tabela de mensagens
    await db.execute(`
      CREATE TABLE messages (
        id VARCHAR(36) PRIMARY KEY,
        room_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        content LONGTEXT,
        type VARCHAR(20) DEFAULT 'text',
        file_url LONGTEXT,
        file_type VARCHAR(50),
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
    console.log('  ✅ Tabela: messages');

    // Tabela de participantes
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
    console.log('  ✅ Tabela: room_participants');

    // Tabela de métricas
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
    console.log('  ✅ Tabela: metrics');

    // Tabela de status de digitação
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
    console.log('  ✅ Tabela: typing_status');

    console.log('\n' + '═'.repeat(50));
    console.log('✅ MySQL inicializado com sucesso!');
    console.log('\n📝 Próximos passos:');
    console.log('  1. Atualizar .env com: DB_TYPE=mysql');
    console.log('  2. Executar: npm run seed (para popular dados de teste)');
    console.log('  3. Iniciar servidor: npm start');

    await connection.end();
    await db.end();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Erro ao inicializar MySQL:');
    console.error(`   ${error.message}`);
    process.exit(1);
  }
}

initMySQL();
