import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

export const VM = sequelize.define('VM', {
  //id
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  //vmid
  vmid: { type: DataTypes.INTEGER, unique: true, allowNull: false },

  //vm名称
  name: { type: DataTypes.STRING, allowNull: false },

  //虚拟机组
  group: { type: DataTypes.STRING, allowNull: true },

  //属于哪个用户，null表示没有分配给用户
  user_name: { type: DataTypes.STRING, allowNull: true, defaultValue: null },

  //vm所在节点
  node: { type: DataTypes.STRING, allowNull: true },

  //虚拟机ip
  ip: { type: DataTypes.STRING, allowNull: true },

  //cpu使用率
  cpu: { type: DataTypes.STRING, allowNull: true },

  //cpu数量
  cpus: { type: DataTypes.STRING, allowNull: true },

  //内存大小
  mem: { type: DataTypes.INTEGER, allowNull: false },

  //开机运行时间
  uptime: { type: DataTypes.INTEGER, allowNull: true },

  //此次开机的网络流入
  netin: { type: DataTypes.STRING, allowNull: true },

  //此次开机的网络流出
  netout: { type: DataTypes.STRING, allowNull: true },

  //根磁盘大小
  disk: { type: DataTypes.INTEGER, allowNull: true },

  //运行状态
  status: { type: DataTypes.STRING, allowNull: true },

  //是否为虚拟机模板
  is_template: { type: DataTypes.STRING, allowNull: true },

  //是否有快照
  has_snapshot: { type: DataTypes.STRING, allowNull: true, defaultValue: '0' },

  //是否绑定
  // has_assigned: { type: DataTypes.STRING, allowNull: true, defaultValue: '0' },

  //虚拟机用户
  vm_user: { type: DataTypes.STRING, allowNull: true, defaultValue: 'administrator' },

  //虚拟机密码
  vm_password: { type: DataTypes.STRING, allowNull: true, defaultValue: '123456' },

  //rdp端口
  rdp_port: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 3389 },

  //vnc端口
  vnc_port: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 5590 },

  //spice端口
  spice_port: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 5900 }
}, {
  timestamps: false,
  tableName: 'vms'
});