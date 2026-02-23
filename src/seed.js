/**
 * Script de inicialização com dados de teste
 * Este arquivo cria dados de exemplo para testar a aplicação
 */

const db = require('./config/database');
const User = require('./models/User');
const ChatRoom = require('./models/ChatRoom');
const Message = require('./models/Message');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

async function seedDatabase() {
  try {
    console.log('🌱 Iniciando seed do banco de dados...');

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
        console.log(`✅ Usuário criado: ${user.name}`);
      } else {
        createdUsers.push(existing);
        console.log(`⏭️  Usuário já existe: ${existing.name}`);
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
      // Verificar se sala já existe
      const allRooms = await ChatRoom.findAll();
      const existing = allRooms.find(r => r.name === roomData.name);

      if (!existing) {
        const room = await ChatRoom.create(roomData);
        createdRooms.push(room);
        console.log(`✅ Sala criada: ${room.name}`);
      } else {
        createdRooms.push(existing);
        console.log(`⏭️  Sala já existe: ${existing.name}`);
      }
    }

    // Adicionar participantes
    for (let i = 0; i < createdRooms.length; i++) {
      const room = createdRooms[i];
      
      // Primeiro, adicionar o dono
      try {
        await ChatRoom.addParticipant(room.id, room.owner_id);
        console.log(`✅ Dono adicionado à sala: ${room.name}`);
      } catch (e) {
        // Já existe
      }
      
      // Depois, adicionar outros usuários
      for (const user of createdUsers) {
        if (user.id !== room.owner_id) {
          try {
            await ChatRoom.addParticipant(room.id, user.id);
            console.log(`✅ ${user.name} adicionado à sala: ${room.name}`);
          } catch (e) {
            // Já existe
          }
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

    for (const msgData of messages) {
      const msg = await Message.create(msgData);
      console.log(`✅ Mensagem criada na sala: ${createdRooms.find(r => r.id === msgData.roomId).name}`);
    }

    // Atualizar status de alguns usuários
    await User.updateStatus(createdUsers[0].id, 'online');
    await User.updateStatus(createdUsers[1].id, 'online');
    await User.updateStatus(createdUsers[2].id, 'offline');
    await User.updateStatus(createdUsers[3].id, 'online');

    console.log('\n✅ Banco de dados inicializado com sucesso!');
    console.log('\n📝 Contas de teste criadas:');
    console.log('   Admin:  admin@taiksu.com / admin123');
    console.log('   Joao:   joao@example.com / senha123');
    console.log('   Maria:  maria@example.com / senha123');
    console.log('   Pedro:  pedro@example.com / senha123');

    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao inicializar banco:', error);
    process.exit(1);
  }
}

// Executar seed
seedDatabase();
