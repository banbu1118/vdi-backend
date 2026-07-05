import { jwtVerify, SignJWT } from 'jose';
import { User } from '../models/User.js';
import { getConfig } from '../utils/getConfig.js';

// 基础认证中间件
export async function auth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ code: 401, message: '未提供 Token' });

  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ code: 401, message: 'Token 无效' });

  try {
    // 创建编码器
    const secret = new TextEncoder().encode(getConfig('JWT_SECRET'));
    
    // 验证 JWT
    const { payload } = await jwtVerify(token, secret);
    
    req.user = payload; // 在控制器中可用 req.user.role / req.user.id
    next();
  } catch (err) {
    console.error('JWT 验证错误:', err);
    return res.status(401).json({ code: 401, message: 'Token 已过期或无效' });
  }
}



/**
 * 角色权限 + 单点登录校验中间件
 * @param {string|array} roles 允许访问的角色，可选
 */
export function authorize(roles = []) {
  if (typeof roles === 'string') roles = [roles];

  return async (req, res, next) => {
    try {
      // JWT payload 中有 id
      const payload = req.user;
      if (!payload) {
        return res.status(401).json({ code: 401, message: '未认证' });
      }

      // 从数据库查出完整用户信息，包含 current_token 和 role
      const user = await User.findByPk(payload.id);
      if (!user) {
        return res.status(401).json({ code: 401, message: '用户不存在' });
      }

      // 单点登录校验
      const authHeader = req.headers.authorization;
      const token = authHeader?.split(' ')[1];
      if (!token || user.current_token !== token) {
        return res.status(403).json({ code: 403, message: '该账号已在其他设备登录，请重新登录' });
      }

      // 角色权限校验
      if (roles.length > 0 && !roles.includes(user.role)) {
        return res.status(403).json({ code: 403, message: '权限不足' });
      }

      // 将数据库里的用户挂载到 req.user
      req.user = user;
      next();
    } catch (err) {
      console.error('授权失败:', err);
      res.status(500).json({ code: 500, message: '授权中出现错误', error: err.message });
    }
  };
}


// 生成 JWT 令牌（如果需要）
export async function generateToken(payload, expiresIn = '24h') {
  const secret = new TextEncoder().encode(getConfig('JWT_SECRET'));
  
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(expiresIn)
    .sign(secret);
}