import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

export const VMGroup = sequelize.define('VMGroup', {
    //id
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    //vm_group
    vm_group: { type: DataTypes.STRING, defaultValue: 'group', unique: true, allowNull: false },

    //description
    description: { type: DataTypes.STRING, allowNull: true },

    //vm_user
    vm_user: { type: DataTypes.STRING, allowNull: true, defaultValue: 'administrator' },

    //vm_password
    vm_password: { type: DataTypes.STRING, allowNull: true },

    //rdp端口
    rdp_port: { type: DataTypes.STRING, allowNull: true, defaultValue: '3389' },

    //模板vmid
    template_vmid: { type: DataTypes.STRING, allowNull: false },

    //模板名称
    template_name: { type: DataTypes.STRING, allowNull: false },

    //是否未完整克隆模式
    is_full_clone: { type: DataTypes.STRING, allowNull: false, defaultValue: '0' },

    //是否启用快照
    is_snapshot: { type: DataTypes.STRING, allowNull: false, defaultValue: '0' },

    //虚拟机数量
    vm_count: { type: DataTypes.STRING, allowNull: false },

    //虚拟机前缀
    vm_prefix: { type: DataTypes.STRING, allowNull: false },

    //虚拟机后缀
    vm_suffix: { type: DataTypes.STRING, allowNull: false },

    //cpu数量
    cpus: { type: DataTypes.STRING, allowNull: true, defaultValue: '4' },

    //内存大小（MB）
    memory_mb: { type: DataTypes.STRING, allowNull: true, defaultValue: '4096' },

    //存储
    storage: { type: DataTypes.STRING, allowNull: false },

    //网络接口
    network_interface: { type: DataTypes.STRING, allowNull: false },

    //是否使用VLAN
    is_vlan: { type: DataTypes.STRING, allowNull: true, defaultValue: '0' },

    //VLAN ID
    vlan_id: { type: DataTypes.STRING, allowNull: true },

    //是否使用静态IP
    is_static_ip: { type: DataTypes.STRING, allowNull: true, defaultValue: '0' },

    //IP地址范围
    ip_start: { type: DataTypes.STRING, allowNull: true },
    ip_end: { type: DataTypes.STRING, allowNull: true },

    //子网掩码
    netmask: { type: DataTypes.STRING, allowNull: true },

    //网关
    gateway: { type: DataTypes.STRING, allowNull: true },

    //dns
    dns1: { type: DataTypes.STRING, allowNull: true },
    dns2: { type: DataTypes.STRING, allowNull: true },

}, { timestamps: false, tableName: 'vmgroup' });