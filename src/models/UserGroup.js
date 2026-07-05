import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

export const UserGroup = sequelize.define('user_group', {
    //id 主键 自增
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    // 用户名组
    user_group: { type: DataTypes.STRING, allowNull: false },
    // 描述
    description: { type: DataTypes.STRING, allowNull: true },
    //状态是否禁用 0 启用 1 已禁用
    disabled: { type: DataTypes.STRING, defaultValue: '0' },
    //绑定虚拟机组
    bind_vm_group: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
}, { timestamps: false, tableName: 'usergroup' });