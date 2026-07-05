import { sequelize } from '../config/db.js';
import { User } from './User.js';
import { VM } from './VM.js';
import { UserGroup } from './UserGroup.js';
import { VMGroup } from './VMGroup.js';

// 建立一对多关联
User.hasMany(VM, { foreignKey: 'user_name', sourceKey: 'username' });
VM.belongsTo(User, { foreignKey: 'user_name', targetKey: 'username' });

// 用户 ↔ 用户组
User.belongsTo(UserGroup, { foreignKey: 'user_group_id' });
UserGroup.hasMany(User, { foreignKey: 'user_group_id' });

// 虚拟机 ↔ VM 组
VM.belongsTo(VMGroup, { foreignKey: 'vm_group_id' });
VMGroup.hasMany(VM, { foreignKey: 'vm_group_id' });

export { sequelize, User, VM, UserGroup, VMGroup };