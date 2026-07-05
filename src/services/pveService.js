import { pveRequest } from '../config/pveClient.js';

let cachedNode = null;
let lastFetchTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

// 获取第一个节点（带缓存和重试）
export const fetchNode = async () => {
  // 如果缓存有效，直接返回
  if (cachedNode && Date.now() - lastFetchTime < CACHE_TTL) {
    return cachedNode;
  }

  const maxRetries = 10;
  const retryInterval = 2000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await pveRequest('get', '/nodes');
      const node = result.data?.[0]?.node;

      if (node) {
        cachedNode = node;
        lastFetchTime = Date.now();
        if (attempt > 1) {
          console.log(`[fetchNode] 第 ${attempt} 次尝试成功获取节点:`, node);
        }
        return node;
      }

      if (attempt < maxRetries) {
        console.warn(`[fetchNode] 第 ${attempt} 次尝试获取节点失败，${retryInterval / 1000} 秒后重试...`);
        await new Promise(resolve => setTimeout(resolve, retryInterval));
      }
    } catch (error) {
      if (attempt < maxRetries) {
        console.warn(`[fetchNode] 第 ${attempt} 次尝试获取节点异常:`, error.message, `，${retryInterval / 1000} 秒后重试...`);
        await new Promise(resolve => setTimeout(resolve, retryInterval));
      } else {
        console.error('[fetchNode] 第', attempt, '次尝试获取节点失败:', error.message);
      }
    }
  }

  // 所有重试都失败，但有缓存，返回缓存
  if (cachedNode) {
    console.warn('[fetchNode] 所有重试失败，使用过期缓存:', cachedNode);
    return cachedNode;
  }

  return null;
};

// 清除节点缓存（供外部调用）
export const clearNodeCache = () => {
  cachedNode = null;
  lastFetchTime = 0;
};

// 获取所有存储
export const fetchStorages = async () => {
  const result = await pveRequest('get', '/storage');
  return result.data.map(s => s.storage);
};

// 获取存储使用情况
export const fetchStorageUsage = async () => {
  const node = await fetchNode();
  if (!node) throw new Error('未能获取到 PVE 节点');

  const storages = await fetchStorages();

  // 并发获取每个 storage 使用情况
  const usageList = await Promise.all(
    storages.map(async storage => {
      const usage = await pveRequest('get', `/nodes/${node}/storage/${storage}/status`);
      return {
        storage,
        info: {
          used: usage.data?.used ?? 0,
          total: usage.data?.total ?? 0
        }
      };
    })
  );

  return usageList;
};

// 获取系统信息（版本 + CPU + 内存）
export const fetchSystemInfo = async () => {
  const node = await fetchNode();
  if (!node) throw new Error('未能获取到 PVE 节点');

  const result = await pveRequest('get', `/nodes/${node}/status`);
  const info = result.data;

  return {
    pveversion: info.pveversion,
    kversion: info.kversion,
    memory: {
      total: info.memory?.total ?? 0
    },
    cpuinfo: {
      model: info.cpuinfo?.model,
      cores: info.cpuinfo?.cores,
      cpus: info.cpuinfo?.cpus
    }
  };
};

// 获取节点运行状态（精简）
export const fetchNodeStatus = async () => {
  const node = await fetchNode();
  if (!node) throw new Error('未能获取到 PVE 节点');

  const result = await pveRequest('get', `/nodes/${node}/status`);
  const info = result.data;

  return {
    uptime: info.uptime,
    cpu: info.cpu,
    memory: {
      used: info.memory?.used ?? 0,
      total: info.memory?.total ?? 0
    },
    swap: {
      used: info.swap?.used ?? 0,
      total: info.swap?.total ?? 0
    },
    loadavg: info.loadavg,
    wait: info.wait
  };
};
