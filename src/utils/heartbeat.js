import { User } from '../models/User.js';
import { Op } from 'sequelize';
import { jwtVerify } from 'jose';
import { getConfig } from './getConfig.js';

/**
 * 验证 JWT token
 * @param {string} token - JWT token
 * @returns {Promise<Object|null>} - 解码后的token数据或null
 */
export const verifyToken = async (token) => {
  try {
    const jwtSecret = new TextEncoder().encode(getConfig('JWT_SECRET'));
    const { payload } = await jwtVerify(token, jwtSecret);
    return payload;
  } catch (err) {
    console.error('Token验证失败:', err.message);
    return null;
  }
};

/**
 * 处理心跳请求
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 */
export const handleHeartbeat = async (req, res) => {
  try {
    // 从认证中间件中获取用户信息
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({ code: 401, message: '未认证' });
    }
    
    // 检查用户是否处于锁定状态
    if (user.status === 'locked') {
      return res.status(423).json({ code: 423, message: '账户已锁定' });
    }
    
    // 更新用户状态和最后活动时间
    await user.update({
      status: 'online',
      last_login: new Date() // 使用last_login字段记录最后活动时间
    });
    
    res.json({ code: 0, message: '心跳成功' });
  } catch (err) {
    console.error('心跳处理失败:', err);
    res.status(500).json({ code: 500, message: '心跳失败', error: err.message });
  }
};

/**
 * 检查并更新离线用户状态
 * @param {number} timeoutMinutes - 超时时间（分钟）
 */
// export const checkOfflineUsers = async (timeoutMinutes = 5) => {
export const checkOfflineUsers = async (timeoutMinutes = 1) => {
  try {
    const timeoutTime = new Date(Date.now() - timeoutMinutes * 60 * 1000);
    
    // 更新超过超时时间没有活动的用户为离线
    const updated = await User.update(
      { status: 'offline' },
      {
        where: {
          status: 'online',
          last_login: {
            [Op.lt]: timeoutTime
          }
        }
      }
    );
    
    if (updated[0] > 0) {
      console.log(`[心跳] 更新了 ${updated[0]} 个用户为离线状态`);
    }
  } catch (err) {
    console.error('检查离线用户失败:', err);
  }
};

/**
 * 启动心跳检查定时器
 * @param {number} intervalMinutes - 检查间隔（分钟）
 * @param {number} timeoutMinutes - 超时时间（分钟）
 */
// export const startHeartbeatChecker = (intervalMinutes = 5, timeoutMinutes = 5) => {
export const startHeartbeatChecker = (intervalMinutes = 1, timeoutMinutes = 1) => {
  // 立即执行一次检查
  checkOfflineUsers(timeoutMinutes);
  
  // 设置定时器
  setInterval(() => {
    checkOfflineUsers(timeoutMinutes);
  }, intervalMinutes * 60 * 1000);
  
  console.log(`[心跳] 启动心跳检查，间隔 ${intervalMinutes} 分钟，超时 ${timeoutMinutes} 分钟`);
};
