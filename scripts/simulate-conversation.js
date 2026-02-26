/**
 * simulate-conversation.js
 * Script para simular uma conversa rica com múltiplos participantes e tipos de mídia.
 * Uso: node scripts/simulate-conversation.js <roomId>
 */

const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { UserModel, ChatRoomModel, MessageModel, syncDatabase } = require('../src/models/sequelize-models');

function log(msg) {
  const line = `${new Date().toISOString()} - ${msg}\n`;
  console.log(msg);
  fs.appendFileSync('simulate.log', line);
}

async function run() {
  if (fs.existsSync('simulate.log')) fs.unlinkSync('simulate.log');
  
  const roomId = process.argv[2];
  if (!roomId) {
    log('ERRO: Uso: node scripts/simulate-conversation.js <roomId>');
    process.exit(1);
  }

  log(`--- Iniciando simulação para a sala: ${roomId} ---`);

  try {
    await syncDatabase();
    log('Conexão e sync DB OK.');

    // 1. Garantir existência de usuários básicos
    log('Verificando usuário system...');
    await UserModel.findOrCreate({
      where: { id: 'system' },
      defaults: {
        id: 'system',
        name: 'Sistema',
        email: 'system@taiksu.com',
        role: 'admin',
        password: 'disabled'
      }
    });
    log('Usuário system OK.');

    // 2. Garantir existência da sala
    log(`Verificando sala ${roomId}...`);
    let room = await ChatRoomModel.findByPk(roomId);
    if (!room) {
      log(`Criando sala de teste: ${roomId}`);
      room = await ChatRoomModel.create({
        id: roomId,
        name: 'Sala de Teste Gemini v2',
        type: 'support',
        description: 'Sala gerada pelo script de simulação',
        owner_id: 'system'
      });
      log('Sala criada OK.');
    } else {
      log('Sala já existe OK.');
    }

    // 3. Criar Usuários da Conversa
    log('Verificando usuários da conversa...');
    const usersData = [
      { id: 'user_alice', name: 'Alice Silva', email: 'alice@test.com', avatar: 'https://i.pravatar.cc/100?u=alice' },
      { id: 'user_bob', name: 'Bob Atendente', email: 'bob@test.com', avatar: 'https://i.pravatar.cc/100?u=bob' },
      { id: 'user_charlie', name: 'Charlie Supervisor', email: 'charlie@test.com', avatar: 'https://i.pravatar.cc/100?u=charlie' }
    ];

    for (const u of usersData) {
      await UserModel.findOrCreate({
        where: { id: u.id },
        defaults: {
            ...u,
            password: 'mock-password'
        }
      });
    }
    log('Usuários da conversa OK.');

    // 4. Sequência de Mensagens
    const messages = [
      { userId: 'user_alice', content: 'Olá, alguém pode me ajudar com um pedido?', type: 'text' },
      { userId: 'user_alice', content: 'Esqueci de adicionar um item no carrinho.', type: 'text' },
      { userId: 'user_bob', content: 'Olá Alice! Eu sou o Bob. Posso ajudar sim.', type: 'text' },
      { userId: 'user_bob', content: 'Qual o número do seu pedido?', type: 'text' },
      { userId: 'user_alice', content: 'É o #4592. Veja este print da tela:', type: 'text' },
      { 
        userId: 'user_alice', 
        content: 'Print do problema', 
        type: 'image', 
        file_url: 'https://picsum.photos/seed/chat1/600/400', 
        file_type: 'image/jpeg' 
      },
      { userId: 'user_bob', content: 'Entendi. Deixe-me chamar o supervisor Charlie para autorizar a alteração.', type: 'text' },
      { userId: 'user_charlie', content: 'Oi Alice, sou o Charlie. Já vi seu caso.', type: 'text' },
      { userId: 'user_charlie', content: 'Autorizei a alteração. Bob, pode seguir.', type: 'text' },
      { 
        userId: 'user_bob', 
        content: 'Instruções de áudio', 
        type: 'audio', 
        file_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', 
        file_type: 'audio/mpeg' 
      },
      { userId: 'user_alice', content: 'Nossa, muito obrigada! Vocês são ótimos! ❤️', type: 'text' }
    ];

    log(`Inserindo ${messages.length} mensagens...`);

    for (const msg of messages) {
      try {
        await MessageModel.create({
          id: uuidv4(),
          room_id: roomId,
          user_id: msg.userId,
          content: msg.content,
          type: msg.type,
          file_url: msg.file_url || null,
          file_type: msg.file_type || null,
          is_read: 0,
          created_at: new Date()
        });
      } catch (err) {
        log(`Erro ao inserir mensagem de ${msg.userId}: ${err.message}`);
        if (err.parent) log(`Parent Error: ${err.parent.message}`);
      }
      await new Promise(r => setTimeout(r, 50));
    }

    log('--- Simulação concluída com sucesso! ---');
    process.exit(0);

  } catch (error) {
    log(`ERRO FATAL: ${error.message}`);
    if (error.stack) log(`Stack: ${error.stack}`);
    process.exit(1);
  }
}

run();
