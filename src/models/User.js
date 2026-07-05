import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

export const User = sequelize.define('User', {
  //id
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  //基本信息
  //vdi username
  username: { type: DataTypes.STRING, unique: true, allowNull: false },
  //vdi password
  password: { type: DataTypes.STRING, allowNull: false },
  //vdi role
  role: { type: DataTypes.STRING, defaultValue: 'user' },
  //vdi group
  group: { type: DataTypes.STRING, allowNull: true },
  //邮箱
  email: { type: DataTypes.STRING, allowNull: true },
  //手机号
  phone: { type: DataTypes.STRING, allowNull: true },
  // 备注（管理员可填写说明）
  remark: { type: DataTypes.TEXT, allowNull: true },


  //账户状态控制
  // 账号状态（oneline, offline,locked）
  status: { type: DataTypes.STRING, allowNull: true, defaultValue: 'offline' },
  // 账号是否被禁用
  disabled: { type: DataTypes.STRING, allowNull: true, defaultValue: '0' },
  // 连续登陆失败次数错误 ≥ 5 次，锁定 30 分钟
  login_fail_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  // 账号锁定到期时间（用于防暴力破解）
  lock_until: { type: DataTypes.DATE, allowNull: true },
  //用户单点登陆
  current_token: { type: DataTypes.STRING, allowNull: true },

  //登陆记录
  //最后登录时间
  last_login: { type: DataTypes.DATE, allowNull: true },
  //用户登录IP
  login_ip: { type: DataTypes.STRING, allowNull: true },
  //客户端类型:win_client, mac_client, linux_client, web_client, os_client
  client_type: { type: DataTypes.STRING, allowNull: true },
  //判断客户端登陆是否为公网：服务器请求地址 !=== 真实服务器地址
  is_public_login: { type: DataTypes.STRING, allowNull: true, defaultValue: '0' },


  //登陆策略
  //是否直连
  direct: { type: DataTypes.STRING, allowNull: true, defaultValue: '0' },
  //是否允许公网登陆，0：禁止公网登陆，1：允许公网登陆
  public_gateway: { type: DataTypes.STRING, allowNull: true, defaultValue: '0' },
  //usb重定向，0：禁用usb重定向，1：启用usb重定向
  usb_redirect: { type: DataTypes.STRING, allowNull: true, defaultValue: '0' },
  //硬盘重定向，0：禁用硬盘重定向，1：启用硬盘重定向
  drive_redirect: { type: DataTypes.STRING, allowNull: true, defaultValue: '0' },
  //音频重定向，0：启用声音，1：禁用音频声音
  audio_redirect: { type: DataTypes.STRING, allowNull: true, defaultValue: '1' },
  //打印重定向，0：禁用打印，1：启用打印重定向
  printer_redirect: { type: DataTypes.STRING, allowNull: true, defaultValue: '0' },
  //剪贴板重定向，0：禁用剪贴板，1：启用剪贴板重定向
  clipboard_redirect: { type: DataTypes.STRING, allowNull: true, defaultValue: '0' },
  //服务器到客户端剪贴板，0：禁用，1：启用
  server_to_client_clipboard:{type:DataTypes.STRING, allowNull:true, defaultValue: '0'},
  //客户端到服务器剪贴板，0：禁用，1：启用
  client_to_server_clipboard:{type:DataTypes.STRING, allowNull:true, defaultValue: '0'},

  // 是否启用MFA多因子验证
  mfa_enabled: { type: DataTypes.STRING, allowNull: true, defaultValue: '0' },
}, {
  timestamps: false,
  tableName: 'users'
  
});