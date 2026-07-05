import crypto from 'crypto';
import { setConfig } from './setConfig.js';

/**
 * 初始化 guacamoleJwt 密钥
 */
export const guacamoleJwt = () => {
  try {
    // 生成随机 JWT 密钥
    const Secret = crypto.randomBytes(16).toString('hex');
    
    // 更新配置文件中的 JWT_SECRET
    const result = setConfig('guacamole_SECRET', Secret);
    
    if (result) {
      console.log('✅ guacamoleJwt 密钥已更新');
      return Secret;
    } else {
      console.error('❌ guacamoleJwt 密钥更新失败');
      return null;
    }
  } catch (err) {
    console.error('❌ 初始化 guacamoleJwt 密钥失败:', err.message);
    return null;
  }
};
