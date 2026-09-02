// src/controllers/userController.js
import bcrypt from 'bcrypt';
import { User, VM, UserGroup } from '../models/index.js';
import { assignVm } from '../utils/assignVm.js';

/**
 * 创建用户（admin 才能操作）
 */
export const createUser = async (req, res) => {
  const { username, password, group} = req.body;

  if (!username || !password) {
    return res.status(400).json({ code: 400, message: '用户名和密码必填' });
  }

  try {
    // 检查用户是否存在
    const existing = await User.findOne({ where: { username } });
    if (existing) {
      return res.status(400).json({ code: 400, message: '用户名已存在' });
    }

    // 密码加密
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      username,
      password: hashedPassword,
      group,
    });

    res.json({
      code: 0,
      message: '用户创建成功',
      data: { username: user.username,}
    });
  } catch (err) {
    console.error('[USER] 创建用户失败:', err);
    res.status(500).json({ code: 500, message: '创建用户失败', error: err.message });
  }
};

/**
 * 批量创建用户
 */
export const batchCreateUsers = async (req, res) => {
  const { 
    userPrefix, 
    userSuffix, 
    password, 
    userCount, 
    group, 
    remark, 
    public_gateway, 
    direct, 
    audio_redirect,
    usb_redirect, 
    drive_redirect, 
    printer_redirect, 
    clipboard_redirect, 
    client_to_server_clipboard, 
    server_to_client_clipboard 
  } = req.body;

  // 验证必填字段
  if (!userPrefix || !userSuffix || !password || !userCount) {
    return res.status(400).json({ code: 400, message: '用户前缀、用户后缀、用户密码和用户数量为必填字段' });
  }

  // 验证用户数量是否为正整数
  const count = parseInt(userCount);
  if (isNaN(count) || count <= 0) {
    return res.status(400).json({ code: 400, message: '用户数量必须是正整数' });
  }

  try {
    const createdUsers = [];

    // 批量创建用户
    for (let i = 1; i <= count; i++) {
      // 解析后缀中的数字部分
      const suffixMatch = userSuffix.match(/(\d+)/);
      let numberPart = 0;
      let suffixPrefix = '';
      
      if (suffixMatch) {
        numberPart = parseInt(suffixMatch[1]);
        suffixPrefix = userSuffix.replace(/\d+/, '');
      } else {
        suffixPrefix = userSuffix;
      }
      
      // 计算当前用户的数字部分
      const currentNumber = numberPart + i - 1;
      
      // 保持数字部分的位数与原后缀一致
      const numberLength = suffixMatch ? suffixMatch[1].length : 0;
      const formattedNumber = currentNumber.toString().padStart(numberLength, '0');
      
      // 生成用户名：userPrefix + 后缀前缀 + 格式化的数字
      const username = `${userPrefix}${suffixPrefix}${formattedNumber}`;
      
      // 检查用户是否存在
      const existing = await User.findOne({ where: { username } });
      if (existing) {
        return res.status(400).json({
          code: 400,
          message: `用户名 ${username} 已存在`
        });
      }

      // 密码加密
      const hashedPassword = await bcrypt.hash(password, 10);

      // 创建用户
      const user = await User.create({
        username,
        password: hashedPassword,
        group,
        remark,
        public_gateway: public_gateway || '0',
        direct: direct || '0',
        audio_redirect: audio_redirect || '1',
        usb_redirect: usb_redirect || '1',
        drive_redirect: drive_redirect || '1',
        printer_redirect: printer_redirect || '1',
        clipboard_redirect: clipboard_redirect || '1',
        client_to_server_clipboard: client_to_server_clipboard || '1',
        server_to_client_clipboard: server_to_client_clipboard || '1'
      });

      createdUsers.push({ username: user.username });
    }

    //根据这个用户组查询数据库，只返回user_group, bind_vm_group字段
    const userGroup = await UserGroup.findOne({
        where: {
            user_group: group
        },
        attributes: ['user_group', 'bind_vm_group']
    });

    console.log('user_group:', userGroup.user_group);
    console.log('bind_vm_group:', userGroup.bind_vm_group);

    //创建一个新数组，将userGroup.bind_vm_group增加一个属性flag:"1"
    // 处理 bind_vm_group 字段，确保它是一个数组
    let bindVmGroup = [];
    if (userGroup.bind_vm_group) {
        if (Array.isArray(userGroup.bind_vm_group)) {
            bindVmGroup = userGroup.bind_vm_group;
        } else if (typeof userGroup.bind_vm_group === 'string') {
            bindVmGroup = userGroup.bind_vm_group.split(',');
        }
    }
    const bindVmGroupWithFlag = bindVmGroup.map(item => ({
        bind_vm_group: item.trim(),
        flag: '1'
    }));

    console.log('bindVmGroupWithFlag:', bindVmGroupWithFlag); 

    console.log('开始绑定虚拟机给用户');

    //绑定虚拟机给用户
    await assignVm(userGroup.user_group, bindVmGroupWithFlag);

    console.log('绑定虚拟机给用户完成');

    // 返回结果
    res.json({
      code: 0,
      message: `批量创建用户完成`
    });
  } catch (err) {
    console.error('[USER] 批量创建用户失败:', err);
    res.status(500).json({ code: 500, message: '批量创建用户失败', error: err.message });
  }
};


/**
 * 创建单个用户
 */
export const createSingleUser = async (req, res) => {
  const {
    username,
    password,
    remark,
    public_gateway,
    direct,
    audio_redirect,
    usb_redirect,
    drive_redirect,
    printer_redirect,
    clipboard_redirect,
    client_to_server_clipboard,
    server_to_client_clipboard
  } = req.body;

  // 验证必填字段
  if (!username || !password) {
    return res.status(400).json({ code: 400, message: '用户名和密码为必填字段' });
  }

  try {
    // 检查用户是否存在
    const existing = await User.findOne({ where: { username } });
    if (existing) {
      return res.status(400).json({ code: 400, message: `用户名 ${username} 已存在` });
    }

    // 密码加密
    const hashedPassword = await bcrypt.hash(password, 10);

    // 创建用户
    const user = await User.create({
      username,
      password: hashedPassword,
      remark,
      public_gateway: public_gateway || '0',
      direct: direct || '0',
      audio_redirect: audio_redirect || '1',
      usb_redirect: usb_redirect || '1',
      drive_redirect: drive_redirect || '1',
      printer_redirect: printer_redirect || '1',
      clipboard_redirect: clipboard_redirect || '1',
      client_to_server_clipboard: client_to_server_clipboard || '1',
      server_to_client_clipboard: server_to_client_clipboard || '1'
    });

    // 返回结果
    res.json({
      code: 0,
      message: `用户 ${user.username} 创建完成`
    });
  } catch (err) {
    console.error('[USER] 创建单个用户失败:', err);
    res.status(500).json({ code: 500, message: '创建单个用户失败', error: err.message });
  }
};

/**
 * 删除用户（admin 才能操作）
 */
export const deleteUser = async (req, res) => {
  const { username } = req.params; // 改为 username

  try {
    const user = await User.findOne({ where: { username } });
    if (!user) {
      return res.status(404).json({ code: 404, message: '用户不存在' });
    }

    await user.destroy();

    res.json({ code: 0, message: `用户 ${username} 删除成功` });
  } catch (err) {
    console.error('[USER] 删除用户失败:', err);
    res.status(500).json({ code: 500, message: '删除用户失败', error: err.message });
  }
};

/**
 * 修改密码
 * - admin 可修改任意用户密码
 * - 普通用户只能修改自己的密码
 */
export const changePassword = async (req, res) => {
  const { username, newPassword } = req.body;
  const user = req.user; // JWT 中的当前登录用户

  if (!newPassword) {
    return res.status(400).json({ code: 400, message: '新密码必填' });
  }

  try {
    const targetUser = await User.findOne({ where: { username } });
    if (!targetUser) {
      return res.status(404).json({ code: 404, message: '用户不存在' });
    }

    // 权限检查
    if (user.role !== 'admin' && user.username !== username) {
      return res.status(403).json({ code: 403, message: '没有权限修改该用户密码' });
    }

    // 密码加密
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    targetUser.password = hashedPassword;
    await targetUser.save();

    res.json({ code: 0, message: `用户 ${username} 密码修改成功` });
  } catch (err) {
    console.error('[USER] 修改密码失败:', err);
    res.status(500).json({ code: 500, message: '修改密码失败', error: err.message });
  }
};


/**
 * 获取所有普通用户列表（admin 才能操作）
 */
export const getAllUsers = async (req, res) => {
  const user = req.user; // 当前登录用户（从 JWT）

  // 权限检查
  if (user.role !== 'admin') {
    return res.status(403).json({ code: 403, message: '没有权限查看所有用户' });
  }

  try {
    // 查询所有普通用户
    const users = await User.findAll({
      where: { role: 'user' },  // 只返回 role 为 'user' 的用户
      attributes: ['username','group','remark','disabled','status', 'last_login', 'login_ip', 'client_type', 'direct', 'public_gateway', 'usb_redirect', 'drive_redirect', 'audio_redirect', 'printer_redirect', 'clipboard_redirect','client_to_server_clipboard','server_to_client_clipboard'] // 只返回部分字段,
    });

    res.json({
      code: 0,
      message: 'success',
      data: users
    });
  } catch (err) {
    console.error('[USER] 获取所有普通用户失败:', err);
    res.status(500).json({ code: 500, message: '获取所有普通用户失败', error: err.message });
  }
};



/**
 * 更新用户信息
 */
export const updateUser = async(req,res)=>{
  const { username,group, remark, public_gateway, direct, audio_redirect, usb_redirect, drive_redirect, printer_redirect, clipboard_redirect, client_to_server_clipboard, server_to_client_clipboard } = req.body;

  // 查找用户
  const user = await User.findOne({ where: { username } });
  if (!user) {
    return res.status(404).json({ code: 404, message: '用户不存在' });
  }

  //禁止更改用户名
  if (user.username !== username) {
    return res.status(400).json({ code: 400, message: '不能更改用户名' });
  }

  // 更新用户信息
  await user.update({
    group,
    remark,
    public_gateway,
    direct,
    audio_redirect,
    usb_redirect,
    drive_redirect,
    printer_redirect,
    clipboard_redirect,
    client_to_server_clipboard,
    server_to_client_clipboard
  });

  res.json({
    code: 0,
    message: '用户信息更新成功'
  });
  

}


/**
 * 禁用用户
 */
export const disableUser = async (req, res) => {
  const { username, disabled } = req.body;

  try {
    // 查找用户
    const user = await User.findOne({ where: { username } });
    if (!user) {
      return res.status(404).json({ code: 404, message: '用户不存在' });
    }

    // 取反：如果传入的是"0"则设为"1"，否则设为"0"
    const newDisabledStatus = disabled === "0" ? "1" : "0";

    if(newDisabledStatus ==="1"){
      //清空当前的token
      await user.update({current_token: ''});
    }
    
    await user.update({ disabled: newDisabledStatus });
    
    const action = newDisabledStatus === "1" ? "禁用" : "启用";
    res.json({ code: 0, message: `用户 ${username} 已${action}` });
    
  } catch (err) {
    console.error('[USER] 禁用用户失败:', err);
    res.status(500).json({ code: 500, message: '禁用用户失败', error: err.message });
  }
};

/**
 * 解除用户锁定
 */
export const unlockUser = async(req,res) =>{
  //更新User表中status字段为字符串offline，并清空lock_until字段和login_fail_count字段
  const { username } = req.body;
  await User.update({ status: 'offline', login_fail_count: 0,lock_until: null }, { where: { username } });
  res.json({ code: 0, message: '用户解锁成功' });
}


/**
 * 分配虚拟机给用户
 */
export const assignVMToUser = async (req, res) => {
  const { vmid } = req.params;
  const { username } = req.body;

  if (!username || !vmid) {
    return res.status(400).json({ code: 400, message: 'username 和 vmid 必填' });
  }

  try {
    // 查用户
    const user = await User.findOne({ where: { username } });

    // 查虚拟机
    const vm = await VM.findOne({ where: { vmid } });

    if (!user || !vm) {
      return res.status(404).json({ code: 404, message: '用户或虚拟机不存在' });
    }

    // 已分配给同一用户
    if (vm.user_name === username) {
      return res.status(400).json({ code: 400, message: '虚拟机已分配给该用户' });
    }

    // 已分配给其他用户
    if (vm.user_name && vm.user_name !== username) {
      return res.status(400).json({ 
        code: 400, 
        message: `虚拟机已被其他用户 (${vm.user_name}) 占用`
      });
    }

    // 更新分配
    await VM.update(
      { user_name: username },
      { where: { vmid } }
    );

    res.json({
      code: 0,
      message: '虚拟机分配成功'
    });

  } catch (err) {
    console.error('[USER] 分配虚拟机失败:', err);
    res.status(500).json({
      code: 500,
      message: '分配虚拟机失败',
      error: err.message
    });
  }
};



/**
 * 取消用户与虚拟机的绑定
 */
// export const unassignVMFromUser = async (req, res) => {
//   const { username, vm_name } = req.body;

//   if (!username || !vm_name) {
//     return res.status(400).json({ code: 400, message: 'username 和 vm_name 必填' });
//   }

//   try {
//     // 查找用户与虚拟机
//     const user = await User.findOne({ where: { username } });
//     const vm = await VM.findOne({ where: { name: vm_name } });

//     if (!user || !vm) {
//       return res.status(404).json({ code: 404, message: '用户或虚拟机不存在' });
//     }

//     // 检查是否已分配
//     const existing = await VM.findOne({
//       where: { name: vm_name },
//       attributes: ['user_name']
//     });

//     if (!existing.user_name) {
//       return res.status(404).json({ code: 404, message: '该用户与该虚拟机未绑定' });
//     }

//    await VM.update(
//       { user_name: null },
//       { where: { name: vm_name } }
//     );

//     res.json({
//       code: 0,
//       message: `用户 ${username} 与虚拟机 ${vm_name} 已解除绑定`
//     });
//   } catch (err) {
//     console.error('[USER] 取消虚拟机绑定失败:', err);
//     res.status(500).json({ code: 500, message: '取消绑定失败', error: err.message });
//   }
// };

/**
 * 取消用户与虚拟机的绑定
 */
export const unassignVMFromUser = async (req, res) => {
  const { vmid } = req.params;
  const { username} = req.body;

  if (!username || !vmid) {
    return res.status(400).json({ code: 400, message: 'username 和 vmid 必填' });
  }

  try {
    // 查用户
    const user = await User.findOne({ where: { username } });
    // 查虚拟机
    const vm = await VM.findOne({ where: { vmid } });

    if (!user || !vm) {
      return res.status(404).json({ code: 404, message: '用户或虚拟机不存在' });
    }

    // 检查虚拟机是否 *当前绑定该用户*
    if (!vm.user_name) {
      return res.status(400).json({ code: 400, message: '该虚拟机目前未绑定任何用户' });
    }

    if (vm.user_name !== username) {
      return res.status(403).json({
        code: 403,
        message: `虚拟机当前绑定的是其他用户 (${vm.user_name})，无法解绑`
      });
    }

    // 执行解绑
    await VM.update(
      { user_name: null },
      { where: { vmid } }
    );

    res.json({
      code: 0,
      message: `用户 ${username} 与虚拟机 ${vmid} 已解除绑定`
    });

  } catch (err) {
    console.error('[USER] 取消虚拟机绑定失败:', err);
    res.status(500).json({ code: 500, message: '取消绑定失败', error: err.message });
  }
};


/**
 * 查询用户绑定的虚拟机列表
 */
export const getUserVMs = async (req, res) => {
  const { username } = req.params;

  try {
    const user = await User.findOne({ where: { username } });
    if (!user) {
      return res.status(404).json({ code: 404, message: '用户不存在' });
    }

    // 直接从 VM 表查询绑定到该用户的虚拟机
    const userVMs = await VM.findAll({
      where: { user_name: username, is_template: '0' },
      attributes: ['vmid', 'name'] // 返回 vmid 和 vm_name
    });

    res.json({
      code: 0,
      message: 'success',
      data: userVMs.map(vm => ({
        vmid: vm.vmid,
        vm_name: vm.name
      }))
    });
  } catch (err) {
    console.error('[USER] 获取用户虚拟机失败:', err);
    res.status(500).json({ code: 500, message: '获取用户虚拟机失败', error: err.message });
  }
};
