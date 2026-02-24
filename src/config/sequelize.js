const path = require('path');
const { Sequelize } = require('sequelize');
require('dotenv').config();

const dbType = process.env.DB_TYPE || 'sqlite';

let sequelize;

if (dbType === 'mysql') {
  sequelize = new Sequelize(
    process.env.DB_NAME || 'chat_taiksu',
    process.env.DB_USER || 'root',
    process.env.DB_PASSWORD || '',
    {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 3306),
      dialect: 'mysql',
      logging: false
    }
  );
} else {
  const sqlitePath = process.env.DB_PATH
    ? path.resolve(process.cwd(), process.env.DB_PATH)
    : path.join(__dirname, 'database.db');

  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: sqlitePath,
    logging: false
  });
}

module.exports = sequelize;
