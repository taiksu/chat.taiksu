/**
 * Sistema de Migrations Automáticas
 * Executa automaticamente na primeira inicialização
 */

const path = require('path');
const fs = require('fs');
const User = require('../models/User');
const ChatRoom = require('../models/ChatRoom');
const Message = require('../models/Message');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const MIGRATION_FILE = path.join(__dirname, '.migrations-done.json');

/**
 * Verificar se migrations já foram executadas
 */
function isMigrationDone() {
  try {
    if (fs.existsSync(MIGRATION_FILE)) {
      const data = JSON.parse(fs.readFileSync(MIGRATION_FILE, 'utf-8'));
      return data.migrated === true;
    }
    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Marcar migrations como executadas
 */
function markMigrationDone() {
  try {
    fs.writeFileSync(MIGRATION_FILE, JSON.stringify({
      migrated: true,
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    }, null, 2));
  } catch (error) {
    console.error('Erro ao marcar migrations:', error);
  }
}

/**
 * Executar seed de dados
 */
async function seedDatabase() {
  try {
    console.log('\n🌱 Executando seed automático...');

    // Criar usuários de teste
    const users = [
      {
        name: 'Admin Taiksu',
        email: 'admin@taiksu.com',
        password: await bcrypt.hash('admin123', 10),
        role: 'admin'
      },
      {
        name: 'João Silva',
        email: 'joao@example.com',
        password: await bcrypt.hash('senha123', 10),
        role: 'user'
      },
      {
        name: 'Maria Santos',
        email: 'maria@example.com',
        password: await bcrypt.hash('senha123', 10),
        role: 'user'
      },
      {
        name: 'Pedro Costa',
        email: 'pedro@example.com',
        password: await bcrypt.hash('senha123', 10),
        role: 'user'
      }
    ];

    let createdUsers = [];

    // Verificar se usuários já existem
    for (const userData of users) {
      const existing = await User.findByEmail(userData.email);
      if (!existing) {
        const user = await User.create(userData);
        createdUsers.push(user);
        console.log(`  ✅ Usuário criado: ${user.name}`);
      } else {
        createdUsers.push(existing);
        console.log(`  ⏭️  Usuário já existe: ${existing.name}`);
      }
    }

    // Criar salas de chat
    const rooms = [
      {
        name: 'Suporte Geral',
        description: 'Sala para dúvidas gerais e suporte',
        ownerId: createdUsers[0].id,
        type: 'support'
      },
      {
        name: 'Bugs e Reportes',
        description: 'Reportar bugs e problemas técnicos',
        ownerId: createdUsers[0].id,
        type: 'support'
      },
      {
        name: 'Vendas',
        description: 'Suporte para dúvidas de vendas',
        ownerId: createdUsers[0].id,
        type: 'sales'
      }
    ];

    let createdRooms = [];

    for (const roomData of rooms) {
      const allRooms = await ChatRoom.findAll();
      const existing = allRooms.find(r => r.name === roomData.name);

      if (!existing) {
        const room = await ChatRoom.create(roomData);
        createdRooms.push(room);
        console.log(`  ✅ Sala criada: ${room.name}`);
      } else {
        createdRooms.push(existing);
        console.log(`  ⏭️  Sala já existe: ${existing.name}`);
      }
    }

    // Adicionar participantes
    for (const room of createdRooms) {
      for (const user of createdUsers) {
        try {
          await ChatRoom.addParticipant(room.id, user.id);
        } catch (e) {
          // Já existe, ignorar
        }
      }
    }

    // Criar mensagens de teste
    const messages = [
      {
        roomId: createdRooms[0].id,
        userId: createdUsers[1].id,
        content: 'Olá! Preciso de ajuda com a minha conta.',
        type: 'text'
      },
      {
        roomId: createdRooms[0].id,
        userId: createdUsers[0].id,
        content: 'Oi João! Bem-vindo ao Chat Taiksu. Como podemos ajudá-lo?',
        type: 'text'
      },
      {
        roomId: createdRooms[0].id,
        userId: createdUsers[2].id,
        content: 'Bom dia pessoal! Também tenho uma dúvida sobre o sistema.',
        type: 'text'
      },
      {
        roomId: createdRooms[1].id,
        userId: createdUsers[3].id,
        content: 'Encontrei um bug ao fazer login.',
        type: 'text'
      },
      {
        roomId: createdRooms[1].id,
        userId: createdUsers[0].id,
        content: 'Entendido! Vamos investigar esse problema. Pode descrever o erro?',
        type: 'text'
      }
    ];

    // Verificar se mensagens já existem
    const existingMessages = await Message.findByRoomId(createdRooms[0].id);
    if (existingMessages.length === 0) {
      for (const msgData of messages) {
        await Message.create(msgData);
      }
      console.log(`  ✅ ${messages.length} mensagens criadas`);
    } else {
      console.log(`  ⏭️  Mensagens já existem`);
    }

    // Atualizar status de alguns usuários
    for (const user of createdUsers.slice(0, 2)) {
      await User.updateStatus(user.id, 'online');
    }

    console.log('\n✅ Seed executado com sucesso!');
    console.log('📝 Contas de teste disponíveis:');
    console.log('   Admin:  admin@taiksu.com / admin123');
    console.log('   João:   joao@example.com / senha123');
    console.log('   Maria:  maria@example.com / senha123');
    console.log('   Pedro:  pedro@example.com / senha123\n');

    markMigrationDone();
    return true;
  } catch (error) {
    console.error('❌ Erro ao executar seed:', error.message);
    return false;
  }
}

/**
 * Executar migrations automaticamente
 */
async function runMigrations() {
  if (isMigrationDone()) {
    console.log('✅ Migrations já foram executadas anteriormente');
    return true;
  }

  console.log('\n🔄 Primeira inicialização detectada');
  console.log('═'.repeat(50));
  
  const success = await seedDatabase();
  
  if (success) {
    console.log('═'.repeat(50));
    return true;
  } else {
    console.error('Falha nas migrations. Tente executar: npm run seed');
    return false;
  }
}

module.exports = { runMigrations, isMigrationDone };
