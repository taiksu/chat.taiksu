const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const ChatRoom = require('../models/ChatRoom');
const Message = require('../models/Message');
const { syncDatabase } = require('../models/sequelize-models');

const MIGRATION_FILE = path.join(__dirname, '.migrations-done.json');

function isMigrationDone() {
  try {
    if (!fs.existsSync(MIGRATION_FILE)) return false;
    const data = JSON.parse(fs.readFileSync(MIGRATION_FILE, 'utf-8'));
    return data.migrated === true;
  } catch (_error) {
    return false;
  }
}

function markMigrationDone() {
  fs.writeFileSync(MIGRATION_FILE, JSON.stringify({
    migrated: true,
    timestamp: new Date().toISOString(),
    version: '2.0.0'
  }, null, 2));
}

async function seedDatabase() {
  const adminPassword = await bcrypt.hash('admin123', 10);
  const userPassword = await bcrypt.hash('senha123', 10);

  let admin = await User.findByEmail('admin@taiksu.com');
  if (!admin) {
    admin = await User.create({
      name: 'Admin Taiksu',
      email: 'admin@taiksu.com',
      password: adminPassword,
      role: 'admin'
    });
  }

  let user = await User.findByEmail('cliente@taiksu.com');
  if (!user) {
    user = await User.create({
      name: 'Cliente Demo',
      email: 'cliente@taiksu.com',
      password: userPassword,
      role: 'user'
    });
  }

  const existingRooms = await ChatRoom.findAll();
  let room = existingRooms.find((r) => r.name === 'Suporte');
  if (!room) {
    room = await ChatRoom.create({
      name: 'Suporte',
      description: 'Canal principal de atendimento',
      ownerId: admin.id,
      type: 'support'
    });
  }

  await ChatRoom.addParticipant(room.id, admin.id);
  await ChatRoom.addParticipant(room.id, user.id);

  const roomMessages = await Message.findByRoomId(room.id, 1);
  if (!roomMessages.length) {
    await Message.create({
      roomId: room.id,
      userId: user.id,
      content: 'Ola, preciso de ajuda com meu chamado.',
      type: 'text'
    });
    await Message.create({
      roomId: room.id,
      userId: admin.id,
      content: 'Perfeito, vou te ajudar agora.',
      type: 'text'
    });
  }

  await User.updateStatus(admin.id, 'online');
}

async function runMigrations() {
  await syncDatabase();

  if (isMigrationDone()) {
    console.log('Migrations ja executadas anteriormente');
    return true;
  }

  try {
    await seedDatabase();
    markMigrationDone();
    console.log('Seed inicial executado com sucesso');
    return true;
  } catch (error) {
    console.error('Erro ao executar seed inicial:', error);
    return false;
  }
}

module.exports = { runMigrations, isMigrationDone };
