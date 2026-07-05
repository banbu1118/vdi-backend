import { User, VM, UserGroup,VMGroup} from '../models/index.js';

//分配虚拟机组给用户组
//在用户创建和虚拟机组编辑时调用
export const assignVm = async (user_group, diffGroups) => {
  console.log('[ASSIGN_VM] 开始分配虚拟机组给用户组');
  console.log('[ASSIGN_VM] 输入参数:', { user_group, diffGroups });

  // 处理错误的参数传递方式
  if (typeof user_group === 'object' && user_group !== null) {
    console.log('[ASSIGN_VM] 检测到错误的参数传递方式，尝试解析对象参数');
    // 尝试从对象中提取参数
    const { user_group: extractedUserGroup, bind_vm_group: extractedVmGroup, diffGroups: extractedDiffGroups } = user_group;
    if (extractedUserGroup) {
      console.log('[ASSIGN_VM] 成功解析对象参数:', { extractedUserGroup, extractedVmGroup, extractedDiffGroups });
      user_group = extractedUserGroup;
      
      if (extractedDiffGroups) {
        // 如果直接提供了 diffGroups，使用它
        diffGroups = extractedDiffGroups;
      } else if (extractedVmGroup) {
        // 如果提供的是 bind_vm_group，转换为 diffGroups 格式
        diffGroups = extractedVmGroup.map(group => ({ bind_vm_group: group, flag: '1' }));
      }
    } else {
      console.log('[ASSIGN_VM] 无法解析对象参数');
      return {
        code: 400,
        message: '参数格式错误，请传递正确的用户组和虚拟机组数组'
      };
    }
  }

  if (!user_group || !diffGroups || !Array.isArray(diffGroups)) {
    console.log('[ASSIGN_VM] 参数验证失败: 用户组名称和差异数组不能为空');
    return {
      code: 400,
      message: '用户组名称和差异数组不能为空'
    };
  }

  try {
    // 检查用户组是否存在
    console.log('[ASSIGN_VM] 检查用户组是否存在:', user_group.trim());
    const existingUserGroup = await UserGroup.findOne({
      where: {
        user_group: user_group.trim()
      }
    });

    if (!existingUserGroup) {
      console.log('[ASSIGN_VM] 用户组不存在:', user_group.trim());
      return {
        code: 404,
        message: '用户组不存在'
      };
    }
    console.log('[ASSIGN_VM] 用户组存在:', user_group.trim());

    const assignResults = [];

    // 遍历每个差异项
    for (const diffItem of diffGroups) {
      const { bind_vm_group: vmGroup, flag } = diffItem;
      console.log('[ASSIGN_VM] 处理虚拟机组:', vmGroup.trim(), '，操作类型:', flag === '1' ? '增加' : '删除');
      
      // 检查虚拟机组是否存在
      console.log('[ASSIGN_VM] 检查虚拟机组是否存在:', vmGroup.trim());
      const existingVMGroup = await VMGroup.findOne({
        where: {
          vm_group: vmGroup.trim()
        }
      });

      if (!existingVMGroup) {
        console.log('[ASSIGN_VM] 虚拟机组不存在:', vmGroup.trim());
        assignResults.push({
          vm_group: vmGroup,
          success: false,
          message: '虚拟机组不存在'
        });
        continue;
      }
      console.log('[ASSIGN_VM] 虚拟机组存在:', vmGroup.trim());

      // 获取该虚拟机组下的所有虚拟机
      const vms = await VM.findAll({
        where: {
          group: vmGroup.trim()
        },
        order: [['name', 'ASC']] // 按照名称升序排序
      });
      console.log('[ASSIGN_VM] 获取到的虚拟机:', vms.map(v => ({ id: v.id, name: v.name })));

      if (flag === '1') {
        // 增加操作：绑定虚拟机给用户
        console.log('[ASSIGN_VM] 执行增加操作：绑定虚拟机给用户');
        
        // 计算用户数量
        const userCount = await User.count({
          where: {
            group: user_group.trim()
          }
        });
        console.log('[ASSIGN_VM] 用户数量:', userCount);

        // 少数分配原则
        const assignCount = Math.min(vms.length, userCount);
        console.log('[ASSIGN_VM] 分配数量:', assignCount);

        // 获取前assignCount个用户，按照用户名排序
        const users = await User.findAll({
          where: {
            group: user_group.trim()
          },
          order: [['username', 'ASC']], // 按照用户名升序排序
          limit: assignCount
        });
        console.log('[ASSIGN_VM] 获取到的用户:', users.map(u => u.username));

        // 分配虚拟机给用户
        console.log('[ASSIGN_VM] 开始分配虚拟机给用户');
        for (let i = 0; i < assignCount; i++) {
          try {
            console.log('[ASSIGN_VM] 分配第', i+1, '个虚拟机 (ID:', vms[i].id, ') 给第', i+1, '个用户 (', users[i].username, ')');
            // 更新vms表中user_name字段绑定的用户为users[i].username
            const updateResult = await VM.update({
              user_name: users[i].username
            }, {
              where: {
                id: vms[i].id
              }
            });
            
            console.log('[ASSIGN_VM] 分配成功，影响行数:', updateResult[0]);
            
            // 验证更新结果
            const updatedVM = await VM.findByPk(vms[i].id);
            console.log('[ASSIGN_VM] 验证更新结果: 虚拟机', vms[i].id, '的user_name字段现在为:', updatedVM.user_name);
          } catch (updateError) {
            console.error('[ASSIGN_VM] 分配失败:', updateError);
          }
        }
      } else if (flag === '0') {
        // 删除操作：解绑虚拟机
        console.log('[ASSIGN_VM] 执行删除操作：解绑虚拟机');
        
        // 遍历该虚拟机组下的所有虚拟机，将user_name设置为null
        for (const vm of vms) {
          try {
            console.log('[ASSIGN_VM] 解绑虚拟机 (ID:', vm.id, ')');
            // 更新vms表中user_name字段为null
            const updateResult = await VM.update({
              user_name: null
            }, {
              where: {
                id: vm.id
              }
            });
            
            console.log('[ASSIGN_VM] 解绑成功，影响行数:', updateResult[0]);
            
            // 验证更新结果
            const updatedVM = await VM.findByPk(vm.id);
            console.log('[ASSIGN_VM] 验证更新结果: 虚拟机', vm.id, '的user_name字段现在为:', updatedVM.user_name);
          } catch (updateError) {
            console.error('[ASSIGN_VM] 解绑失败:', updateError);
          }
        }
      }

      assignResults.push({
        vm_group: vmGroup,
        success: true,
        flag: flag,
        vmCount: vms.length
      });
    }

    console.log('[ASSIGN_VM] 分配完成，结果:', assignResults);
    return {
      code: 0,
      message: '分配完成',
      data: assignResults
    };

  } catch (err) {
    console.error('[ASSIGN_VM] 分配虚拟机组给用户组失败:', err);
    return {
      code: 500,
      message: '分配虚拟机组给用户组失败',
      error: err.message
    };
  }
};
