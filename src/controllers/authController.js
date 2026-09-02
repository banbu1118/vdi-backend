
import { User } from '../models/User.js';
import { compare } from 'bcryptjs';
import { SignJWT } from 'jose';
import { getClientIp } from '../utils/getClientIp.js';
import {getConfig} from '../utils/getConfig.js';
import {isPublicLogin} from '../utils/isPublicLogin.js';

/**
 * 用户登录接口
 * - 支持登录失败次数限制（5次锁定）
 * - 支持锁定时间判断
 * - 自动更新最后登录时间、IP、客户端类型、状态
 * - 判断是否公网登录（根据传入 login_server 对比 HOST_IP）
 * - 单点登录：同一用户新设备登录会覆盖旧设备 token
 * - login_server这个参数现在不使用了，但是保留了，现在判断是否为公网登陆由isPublicLogin模块判断
 */
export const login = async (req, res) => {
  try {
    const { username, password, client_type } = req.body;
    const login_ip = getClientIp(req);


    // 强制要求username, password, client_type, login_server 这4个字段，不能为空
    // if (!username || !password || !client_type || !login_server) {
    if (!username || !password || !client_type) {
      return res.status(401).json({ code: 401, message: '用户名或密码错误' });
    }

    // 查询用户
    const user = await User.findOne({ where: { username } });
    if (!user) {
      return res.status(401).json({ code: 401, message: '用户名或密码错误' });
    }
    
    // 检查用户是否被禁用
    if (user.disabled === '1') {
      return res.status(403).json({
        code: 403,
        message: '用户已被禁用，无法登录'
      });
    }

    // 检查账号锁定
    if (user.lock_until && user.lock_until > new Date()) {
      const minutesLeft = Math.ceil((user.lock_until - new Date()) / 60000);
      return res.status(423).json({
        code: 423,
        message: `账户已锁定，请 ${minutesLeft} 分钟后再试`
      });
    }

    //管理平台web只允许admin登陆
    // if (client_type === 'web_client' && user.role !== 'admin') {
    //   return res.status(403).json({
    //     code: 403,
    //     message: '仅管理员账户允许登录管理平台'
    //   });
    // }

    // 验证密码
    const isValid = await compare(password, user.password);
    if (!isValid) {
      const newFailCount = user.login_fail_count + 1;
      const updates = { login_fail_count: newFailCount };

      if (newFailCount >= 5) {
        updates.lock_until = new Date(Date.now() + 30 * 60 * 1000);
        updates.status = 'locked';
      }

      await user.update(updates);
      return res.status(401).json({
        code: 401,
        message: '用户名或密码错误',
        login_fail_count: newFailCount
      });
    }

    // ===== 登录成功逻辑 =====
    // 判断是否公网登录
    const PublicLogin_Status = isPublicLogin(login_ip);

    // console.log('登陆ip为:', login_ip);
    // console.log('是否公网登录:', PublicLogin_Status);

    // const hostIp = getConfig('HOST_IP') + ':' + getConfig('PORT')
    // const isPublicLogin = login_server && login_server !== hostIp;

    // 如果是公网登录，检查 public_gateway
    if (PublicLogin_Status == true && user.public_gateway == '0') {
      return res.status(403).json({
        code: 403,
        message: '无公网权限，无法登录'
      });
    }

    let is_public_login_status = PublicLogin_Status ? '1' : '0'
    // console.log('当前is_public_login_status:', is_public_login_status);

    // 生成 JWT token
    const jwtSecret = new TextEncoder().encode(getConfig('JWT_SECRET'));
    const token = await new SignJWT({
      id: user.id,
      role: user.role,
      username: user.username
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuedAt()
      .setExpirationTime('2h')
      .sign(jwtSecret);

    // 更新用户信息（单点登录覆盖旧 token）
    await user.update(
      {
        login_fail_count: 0,
        lock_until: null,
        last_login: new Date(),
        login_ip,
        client_type: client_type || 'unknown_client',
        status: 'online',
        is_public_login: is_public_login_status,
        current_token: token
      },
      { where: { id: user.id } }
    );


    await user.reload();

    // 返回登录结果
    res.json({
      code: 0,
      message: '登录成功',
      data: {
        username,
        token
      }
    });
  } catch (err) {
    console.error('登录错误:', err);
    res.status(500).json({ code: 500, message: '登录失败', error: err.message });
  }
};
