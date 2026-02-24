const bcrypt = require('bcryptjs');
const User = require('./models/User');
const ChatRoom = require('./models/ChatRoom');
const Message = require('./models/Message');
const { syncDatabase } = require('./models/sequelize-models');

async function seedDatabase() {
  await syncDatabase();

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
    console.log('Admin criado');
  }

  let user = await User.findByEmail('cliente@taiksu.com');
  if (!user) {
    user = await User.create({
      name: 'Cliente Demo',
      email: 'cliente@taiksu.com',
      password: userPassword,
      role: 'user'
    });
    console.log('Cliente demo criado');
  }

  const rooms = await ChatRoom.findAll();
  let room = rooms.find((r) => r.name === 'Suporte');
  if (!room) {
    room = await ChatRoom.create({
      name: 'Suporte',
      description: 'Canal principal de atendimento',
      ownerId: admin.id,
      type: 'support'
    });
    console.log('Sala Suporte criada');
  }

  await ChatRoom.addParticipant(room.id, admin.id);
  await ChatRoom.addParticipant(room.id, user.id);

  const messages = await Message.findByRoomId(room.id, 1);
  if (!messages.length) {
    await Message.create({
      roomId: room.id,
      userId: user.id,
      content: 'Ola, preciso de ajuda.',
      type: 'text'
    });
    await Message.create({
      roomId: room.id,
      userId: admin.id,
      content: 'Claro, vamos resolver agora.',
      type: 'text'
    });
    console.log('Mensagens iniciais criadas');
  }

  await User.updateStatus(admin.id, 'online');
  console.log('Seed finalizado com sucesso');
}

seedDatabase()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Erro no seed:', error);
    process.exit(1);
  });
