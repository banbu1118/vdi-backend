import { User } from '../models/User.js';
import { VM } from '../models/VM.js';
import { UserGroup } from '../models/UserGroup.js';
import { Op, fn, col } from 'sequelize';


// 获取模板数量
export const getTemplateCount = async () => {
  try {
    const count = await VM.count({
      where: { is_template: '1' }   // ← 注意类型是 STRING
    });
    return count;
  } catch (err) {
    console.error("获取模板数量失败:", err);
    throw err;
  }
};

//获取虚拟机数量
export const getVMCount = async () => {
  try {
    const count = await VM.count({
      where: { is_template: '0' }   // ← 注意类型是 STRING
    });
    return count;
  } catch (err) {
    console.error("获取虚拟机数量失败:", err);
    throw err;
  }
};

// 获取虚拟机组数量（去重）
export const getVmGroupCount = async () => {
  try {
    const count = await VM.count({
      distinct: true,
      col: 'group',
      where: {
        group: {
          [Op.ne]: null,
          [Op.ne]: ''
        }
      }
    });

    return count;
  } catch (err) {
    console.error("获取虚拟机组数量失败:", err);
    throw err;
  }
};

// 获取用户数量（仅统计 role = 'user'）
export const getUserCount = async () => {
  try {
    const count = await User.count({
      where: {
        role: 'user'   // 只统计普通用户
      }
    });

    return count;
  } catch (err) {
    console.error("获取用户数量失败:", err);
    throw err;
  }
};

// 获取 UserGroup中user_group的数量（去重）
export const getUserGroupCount = async () => {
  try {
    const count = await UserGroup.count({
      distinct: true,
      col: 'user_group',
    });

    return count;
  } catch (err) {
    console.error("获取虚拟机组数量失败:", err);
    throw err;
  }
};

// 获取模板列表（只返回 vmid、name）
export const getTemplate = async () => {
  try {
    const result = await VM.findAll({
      where: { is_template: '1' },
      attributes: ['vmid', 'name']  // ← 指定返回字段
    });

    return result;

  } catch (err) {
    console.error("获取模板失败:", err);
    throw err;
  }
};

// 获取虚拟机列表
export const getVMList = async () => {
   try {
    const result = await VM.findAll({
      where: { is_template: '0' },
      attributes: ['vmid', 'name', 'group','user_name','node','ip','vm_user','vm_password','rdp_port','has_snapshot','cpu','cpus','mem','uptime','netin','netout','disk','status']  // ← 指定返回字段
    });

    return result;

  } catch (err) {
    console.error("获取虚拟机失败:", err);
    throw err;
  } 
}