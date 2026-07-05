// networkUtils.js - 网络相关工具函数
import os from 'os';
import { setConfig } from './setConfig.js';


/**
 * 获取系统主要 IP 地址
 * @returns {string} IP 地址（可能是 127.0.0.1）
 */
export const getSystemIPOnce = () => {
  const nets = os.networkInterfaces();

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // 只要 IPv4 + 非内网回环
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }

  return '127.0.0.1';
};

/**
 * 等待系统获取有效的 IP 地址（排除 127.0.0.1 和 169.254.x.x）
 * @param {number} timeout 最大等待时间（毫秒）
 * @param {number} interval 轮询间隔（毫秒）
 * @returns {Promise<string>} 系统 IP
 */
const waitForIP = async (timeout = 30000, interval = 500) => {
  const start = Date.now();
  let ip = '127.0.0.1';

  while (Date.now() - start < timeout) {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        // 只要 IPv4 + 非内网回环 + 非 169.254.x.x（APIPA 地址）
        if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254')) {
          ip = net.address;
          return ip;
        }
      }
    }
    await new Promise(r => setTimeout(r, interval));
  }

  return '127.0.0.1';
};

/**
 * 等待系统获取非 127.0.0.1 的 IP
 * @param {number} timeout 最大等待时间（毫秒）
 * @param {number} interval 轮询间隔（毫秒）
 * @returns {Promise<string>} 系统 IP
 */
export const getSystemIP = async (timeout = 20000, interval = 500) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const ip = getSystemIPOnce();
    if (ip !== '127.0.0.1') {
      return ip;
    }
    await new Promise(r => setTimeout(r, interval));
  }
  console.warn('⚠️ 等待超时，返回默认回环地址 127.0.0.1');
  return '127.0.0.1';
};

/**
 * 更新 .env 文件中的 HOST_IP 为系统 IP
 * @returns {string} 更新后的 IP 地址
 */
export const updateHostIP = async () => {
  try {
    // 等待并获取系统 IP（使用新的 waitForIP 方法确保获取有效 IP）
    const systemIP = await waitForIP(30000, 500);
    
    if (systemIP === '127.0.0.1') {
      console.warn('⚠️ 无法获取有效的系统 IP，使用 127.0.0.1');
    }
      
    // 更新 HOST_IP
    setConfig('HOST_IP', systemIP);
   
    console.log('✅ 已更新 HOST_IP 为系统 IP:', systemIP);
    return systemIP;
  } catch (error) {
    console.error('❌ 更新 HOST_IP 失败:', error);
    return null;
  }
};

// 导出默认函数
export default getSystemIP;
