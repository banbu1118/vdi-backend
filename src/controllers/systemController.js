import {
  fetchNode,
  fetchStorages,
  fetchStorageUsage,
  fetchSystemInfo,
  fetchNodeStatus
} from '../services/pveService.js';
import { getConfig } from '../utils/getConfig.js';

// 获取节点
export const getNode = async (req, res) => {
  try {
    const node = await fetchNode();
    res.json({ code: 0, message: '获取 PVE 节点成功', data: { node } });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取 PVE 节点失败', error: err.message });
  }
};

// 获取存储
export const getStorage = async (req, res) => {
  try {
    const storages = await fetchStorages();
    res.json({ code: 0, message: '获取 PVE 存储成功', data: storages.map(s => ({ storage: s })) });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取 PVE 存储失败', error: err.message });
  }
};

// 获取存储使用情况
export const getStorageUsage = async (req, res) => {
  try {
    const usageList = await fetchStorageUsage();
    res.json({ code: 0, message: '获取存储使用情况成功', data: usageList });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取存储使用情况失败', error: err.message });
  }
};

// 获取系统信息
export const getSystemInfo = async (req, res) => {
  try {
    const info = await fetchSystemInfo();
    res.json({ code: 0, message: '获取 PVE 系统信息成功', data: info });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取 PVE 系统信息失败', error: err.message });
  }
};

// 获取节点状态
export const getNodeStatus = async (req, res) => {
  try {
    const status = await fetchNodeStatus();
    res.json({ code: 0, message: '获取节点运行状态成功', data: status });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取节点运行状态失败', error: err.message });
  }
};


//获取ip地址
export const getPveIp = async (req, res) => {
  try{
    const pveIp = getConfig('PVE_HOST') || '未配置PVE_HOST';
    res.json({ code: 0, message: '获取PVE IP成功', data: { pveIp } });
  }catch(err){
    res.status(500).json({ code: 500, message: '获取PVE IP失败', error: err.message });
  }
}