const { v4: uuidv4 } = require('uuid');
const { UserModel } = require('./sequelize-models');

class User {
  static async create(userData) {
    const id = uuidv4();
    const created = await UserModel.create({
      id,
      name: userData.name,
      email: userData.email,
      password: userData.password || null,
      avatar: userData.avatar || null,
      role: userData.role || 'user',
      sso_id: userData.ssoId || null,
      sso_data: userData.ssoData || null
    });
    return created.get({ plain: true });
  }

  static async findById(id) {
    return UserModel.findByPk(id, { raw: true });
  }

  static async findByEmail(email) {
    return UserModel.findOne({ where: { email }, raw: true });
  }

  static async findAll() {
    return UserModel.findAll({ raw: true });
  }

  static async updateStatus(userId, status) {
    const [changes] = await UserModel.update(
      { status },
      { where: { id: userId } }
    );
    return changes;
  }

  static async updateAvatar(userId, avatarUrl) {
    const [changes] = await UserModel.update(
      { avatar: avatarUrl || null },
      { where: { id: userId } }
    );
    return changes;
  }

  static async update(userId, updateData) {
    const payload = {};
    if (updateData.name !== undefined) payload.name = updateData.name;
    if (updateData.avatar !== undefined) payload.avatar = updateData.avatar;
    if (updateData.role !== undefined) payload.role = updateData.role;
    if (updateData.ssoId !== undefined) payload.sso_id = updateData.ssoId;
    if (updateData.ssoData !== undefined) payload.sso_data = updateData.ssoData;

    if (!Object.keys(payload).length) return 0;
    const [changes] = await UserModel.update(payload, { where: { id: userId } });
    return changes;
  }

  static async findBySSOId(ssoId) {
    return UserModel.findOne({ where: { sso_id: ssoId }, raw: true });
  }
}

module.exports = User;
