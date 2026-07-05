import crypto from 'crypto';
import { setConfig } from './setConfig.js';

/**
 * 初始化 JWT 密钥
 * 如果配置文件中没有 JWT_SECRET 或密钥为默认值，则生成随机密钥并更新配置
 */
export const initJwt = () => {
  try {
    // 生成随机 JWT 密钥
    const jwtSecret = crypto.randomBytes(32).toString('hex');
    
    // 更新配置文件中的 JWT_SECRET
    const result = setConfig('JWT_SECRET', jwtSecret);
    
    if (result) {
      console.log('✅ JWT 密钥已更新');
      return jwtSecret;
    } else {
      console.error('❌ JWT 密钥更新失败');
      return null;
    }
  } catch (err) {
    console.error('❌ 初始化 JWT 密钥失败:', err.message);
    return null;
  }
};
