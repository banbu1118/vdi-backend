import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

export const UserVM = sequelize.define('UserVM', {
  //id
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  //用户id
  user_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },

  //对应users表的username
  username: { type: DataTypes.STRING, allowNull: false, comment: '对应users表的username' },

  //对应vms表的id字段
  vm_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'vms', key: 'id' } },

  //对应vms表的vmid字段
  vmid: { type: DataTypes.INTEGER, allowNull: false, comment: '对应vms表的vmid字段' },

  //对应vms表的name字段
  vm_name: { type: DataTypes.STRING, allowNull: false, comment: '对应vms表的name字段' },
}, {
  timestamps: false,
  tableName: 'user_vms'
});