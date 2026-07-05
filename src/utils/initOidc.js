// 初始化OIDC配置
// 每次启动服务时，生成OIDC_CLIENT_SECRET
// 其他变量保持不变
import crypto from 'crypto';
import {setConfig} from './setConfig.js';

/**
 * 生成 UUID 格式的 OIDC 客户端密钥
 * @returns {string} 生成的 UUID 格式客户端密钥
 */
const generateClientSecret = () => {
  // 生成 16 字节的随机数据
  const randomBytes = crypto.randomBytes(16);
  
  // 设置 UUID 版本号和变体
  randomBytes[6] = (randomBytes[6] & 0x0f) | 0x40; // 版本 4
  randomBytes[8] = (randomBytes[8] & 0x3f) | 0x80; // 变体
  
  // 转换为 UUID 格式字符串
  return [
    randomBytes.subarray(0, 4).toString('hex'),
    randomBytes.subarray(4, 6).toString('hex'),
    randomBytes.subarray(6, 8).toString('hex'),
    randomBytes.subarray(8, 10).toString('hex'),
    randomBytes.subarray(10).toString('hex')
  ].join('-');
};

/**
 * 初始化 OIDC 配置
 * 生成新的 OIDC_CLIENT_SECRET 并写入 .env 文件
 */
export const initOIDCConfig = () => {
  try {
    
    // 生成新的 UUID 格式客户端密钥
    const newClientSecret = generateClientSecret();

    // 更新配置
    setConfig('OIDC_CLIENT_SECRET', newClientSecret);
      
    return newClientSecret;
  } catch (error) {
    console.error('Error initializing OIDC config:', error);
    console.error('Error stack:', error.stack);
  }
};

// 导出默认函数
export default initOIDCConfig;