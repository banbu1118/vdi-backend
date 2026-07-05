import { pveRequest } from '../config/pveClient.js';

export const freeVmid = async () => {
  try {
    // 调用 PVE API 获取下一个可用 VMID
    const res = await pveRequest('get', '/cluster/nextid');

    // 检查错误
    if (res?.error) {
      throw new Error(`获取 VMID 失败: ${res.details || res.error}`);
    }

    if (!res?.data) {
      throw new Error('获取 VMID 失败: 返回数据为空');
    }

    return res; // 直接返回接口原始返回值
  } catch (err) {
    console.error('获取 free VMID 失败:', err);
    throw err;
  }
};