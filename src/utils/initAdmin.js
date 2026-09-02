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
        direct: '0',
        public_gateway: '1',
        usb_redirect: '1',
        drive_redirect: '1',
        audio_redirect: '1',
        printer_redirect: '1',
        clipboard_redirect: '1',
        server_to_client_clipboard: '1', // 服务器到客户端剪贴板，1：启用
        client_to_server_clipboard: '1', // 客户端到服务器剪贴板，1：启用

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
