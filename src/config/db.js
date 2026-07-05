import { Sequelize } from 'sequelize';
import { getConfig } from '../utils/getConfig.js';

export const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: getConfig('DB_PATH') || './pve.sqlite',
  logging: false
});

export const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ SQLite3 数据库连接成功');
  } catch (err) {
    console.error('❌ 数据库连接失败:', err);
  }
};
