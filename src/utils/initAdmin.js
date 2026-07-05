import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';

export async function initAdmin() {
  try {
    const admin = await User.findOne({ where: { username: 'admin' } });

    if (!admin) {
      const hashedPassword = await bcrypt.hash('opendesk', 10); // 默认密码
      
      await User.create({
        // 基本信息
        username: 'admin',
        password: hashedPassword,
        role: 'admin',
        group: 'admin',
        email: 'admin@example.com',
        phone: null,
        remark: '系统自动初始化管理员账户',

        // 状态控制
        status: 'offline',
        login_fail_count: 0,
        lock_until: null,

        // 登录记录
        last_login: null,
        login_ip: null,
        client_type: null,

        // 策略（管理员默认拥有全部权限）
        direct: true,
        public_gateway: true,
        usb_redirect: true,
        drive_redirect: true,
        audio_redirect: true,
        printer_redirect: true,
        clipboard_redirect: true,

        // MFA（可根据需要开启）
        mfa_enabled: false
      });

      console.log('✅ Admin 用户已初始化');
      console.log('   用户名：admin');
      console.log('   密码：123456');
    } else {
      console.log('ℹ️ Admin 用户已存在，无需初始化');
    }
  } catch (err) {
    console.error('❌ 初始化管理员失败：', err);
  }
}
