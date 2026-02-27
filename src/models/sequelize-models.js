const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const common = {
  freezeTableName: true,
  underscored: true
};

const UserModel = sequelize.define('users', {
  id: { type: DataTypes.STRING(64), primaryKey: true },
  name: { type: DataTypes.STRING(255), allowNull: false },
  email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
  password: { type: DataTypes.STRING(255), allowNull: true },
  avatar: { type: DataTypes.TEXT, allowNull: true },
  status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'offline' },
  role: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'user' },
  attendance_state: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'livre' },
  sso_id: { type: DataTypes.BIGINT, allowNull: true },
  sso_data: { type: DataTypes.TEXT, allowNull: true }
}, {
  ...common,
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

const ChatRoomModel = sequelize.define('chat_rooms', {
  id: { type: DataTypes.STRING(64), primaryKey: true },
  name: { type: DataTypes.STRING(255), allowNull: false },
  type: { type: DataTypes.STRING(64), allowNull: false, defaultValue: 'support' },
  status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'aberto' },
  chat_state: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'NEW' },
  assigned_agent_id: { type: DataTypes.STRING(64), allowNull: true },
  description: { type: DataTypes.TEXT, allowNull: true },
  owner_id: { type: DataTypes.STRING(64), allowNull: false }
}, {
  ...common,
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

const MessageModel = sequelize.define('messages', {
  id: { type: DataTypes.STRING(64), primaryKey: true },
  room_id: { type: DataTypes.STRING(64), allowNull: false },
  user_id: { type: DataTypes.STRING(64), allowNull: false },
  content: { type: DataTypes.TEXT, allowNull: true },
  type: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'text' },
  file_url: { type: DataTypes.TEXT, allowNull: true },
  file_type: { type: DataTypes.STRING(255), allowNull: true },
  actions: { type: DataTypes.TEXT, allowNull: true },
  feedback_value: { type: DataTypes.STRING(8), allowNull: true },
  feedback_at: { type: DataTypes.DATE, allowNull: true },
  feedback_by: { type: DataTypes.STRING(64), allowNull: true },
  is_read: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  read_at: { type: DataTypes.DATE, allowNull: true },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, {
  ...common,
  timestamps: false
});

const RoomParticipantModel = sequelize.define('room_participants', {
  id: { type: DataTypes.STRING(64), primaryKey: true },
  room_id: { type: DataTypes.STRING(64), allowNull: false },
  user_id: { type: DataTypes.STRING(64), allowNull: false },
  joined_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  left_at: { type: DataTypes.DATE, allowNull: true }
}, {
  ...common,
  timestamps: false
});

const SupportChamadoRoomModel = sequelize.define('support_chamados_rooms', {
  id: { type: DataTypes.STRING(64), primaryKey: true },
  chamado_id: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  room_id: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  created_by: { type: DataTypes.STRING(64), allowNull: false },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, {
  ...common,
  timestamps: false
});

const MetricModel = sequelize.define('metrics', {
  id: { type: DataTypes.STRING(64), primaryKey: true },
  room_id: { type: DataTypes.STRING(64), allowNull: true },
  date: { type: DataTypes.DATEONLY, allowNull: true },
  messages_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  active_users: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  avg_response_time: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  satisfaction_rating: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, {
  ...common,
  timestamps: false
});

const TypingStatusModel = sequelize.define('typing_status', {
  id: { type: DataTypes.STRING(64), primaryKey: true },
  room_id: { type: DataTypes.STRING(64), allowNull: false },
  user_id: { type: DataTypes.STRING(64), allowNull: false },
  status: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, {
  ...common,
  timestamps: false
});

const ChatQueueModel = sequelize.define('chat_queue', {
  id: { type: DataTypes.STRING(64), primaryKey: true },
  room_id: { type: DataTypes.STRING(64), allowNull: false },
  user_id: { type: DataTypes.STRING(64), allowNull: false },
  status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'waiting' },
  position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  assigned_agent_id: { type: DataTypes.STRING(64), allowNull: true },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  assigned_at: { type: DataTypes.DATE, allowNull: true }
}, {
  ...common,
  timestamps: false
});

ChatRoomModel.belongsTo(UserModel, { foreignKey: 'owner_id', as: 'owner' });
MessageModel.belongsTo(UserModel, { foreignKey: 'user_id', as: 'sender' });
MessageModel.belongsTo(ChatRoomModel, { foreignKey: 'room_id' });
RoomParticipantModel.belongsTo(UserModel, { foreignKey: 'user_id' });
RoomParticipantModel.belongsTo(ChatRoomModel, { foreignKey: 'room_id' });
SupportChamadoRoomModel.belongsTo(ChatRoomModel, { foreignKey: 'room_id' });
SupportChamadoRoomModel.belongsTo(UserModel, { foreignKey: 'created_by', as: 'creator' });
ChatQueueModel.belongsTo(ChatRoomModel, { foreignKey: 'room_id' });
ChatQueueModel.belongsTo(UserModel, { foreignKey: 'user_id' });
ChatQueueModel.belongsTo(UserModel, { foreignKey: 'assigned_agent_id', as: 'assignedAgent' });

let synced = false;

async function ensureUsersColumns() {
  const qi = sequelize.getQueryInterface();
  let columns;
  try {
    columns = await qi.describeTable('users');
  } catch (_err) {
    return;
  }

  if (!columns.sso_id) {
    await qi.addColumn('users', 'sso_id', { type: DataTypes.BIGINT, allowNull: true });
  }
  if (!columns.sso_data) {
    await qi.addColumn('users', 'sso_data', { type: DataTypes.TEXT, allowNull: true });
  }
  if (!columns.attendance_state) {
    await qi.addColumn('users', 'attendance_state', {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'livre'
    });
  }
}

async function ensureChatRoomsColumns() {
  const qi = sequelize.getQueryInterface();
  let columns;
  try {
    columns = await qi.describeTable('chat_rooms');
  } catch (_err) {
    return;
  }

  if (!columns.status) {
    await qi.addColumn('chat_rooms', 'status', {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'aberto'
    });
  }

  if (!columns.chat_state) {
    await qi.addColumn('chat_rooms', 'chat_state', {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'NEW'
    });
  }
  if (!columns.assigned_agent_id) {
    await qi.addColumn('chat_rooms', 'assigned_agent_id', {
      type: DataTypes.STRING(64),
      allowNull: true
    });
  }
}

async function ensureMessagesColumns() {
  const qi = sequelize.getQueryInterface();
  let columns;
  try {
    columns = await qi.describeTable('messages');
  } catch (_err) {
    return;
  }

  if (!columns.actions) {
    await qi.addColumn('messages', 'actions', {
      type: DataTypes.TEXT,
      allowNull: true
    });
  }
  if (!columns.feedback_value) {
    await qi.addColumn('messages', 'feedback_value', {
      type: DataTypes.STRING(8),
      allowNull: true
    });
  }
  if (!columns.feedback_at) {
    await qi.addColumn('messages', 'feedback_at', {
      type: DataTypes.DATE,
      allowNull: true
    });
  }
  if (!columns.feedback_by) {
    await qi.addColumn('messages', 'feedback_by', {
      type: DataTypes.STRING(64),
      allowNull: true
    });
  }
}

async function syncDatabase() {
  if (synced) return;
  await sequelize.authenticate();
  await sequelize.sync();
  await ensureUsersColumns();
  await ensureChatRoomsColumns();
  await ensureMessagesColumns();
  synced = true;
}

module.exports = {
  sequelize,
  UserModel,
  ChatRoomModel,
  MessageModel,
  RoomParticipantModel,
  SupportChamadoRoomModel,
  MetricModel,
  TypingStatusModel,
  ChatQueueModel,
  syncDatabase
};
