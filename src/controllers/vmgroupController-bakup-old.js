import { pveRequest } from '../config/pveClient.js';
import { fetchNode } from '../services/pveService.js';
import { VMGroup } from '../models/VMGroup.js';
import { waitForTask } from '../utils/pveTaskStatus.js';
import { getConfig } from '../utils/getConfig.js';

const NODE = await fetchNode();

/**
 * 获取可用镜像存储
 */
export const getImageStorages = async (req, res) => {
  try {
    const result = await pveRequest('get', '/storage');

    if (!Array.isArray(result.data)) {
      return res.json({
        code: 0,
        data: []
      });
    }

    const storages = result.data
      .filter(s =>
        !s.disable &&
        s.content?.split(',').includes('images')
      )
      .map(s => s.storage);

    return res.json({
      code: 0,
      data: storages
    });

  } catch (err) {
    return res.status(500).json({
      code: 500,
      message: '获取镜像存储失败',
      error: err.message
    });
  }
};


/**
 * 获取可用网桥
 */
export const getBridges = async (req, res) => {
  try {
    const result = await pveRequest('get', `/nodes/${NODE}/network`);

    if (!Array.isArray(result.data)) {
      return res.json({
        code: 0,
        data: []
      });
    }

    const bridges = result.data
      .filter(n => n.type === 'bridge' && n.active)
      .map(n => n.iface);

    return res.json({
      code: 0,
      data: bridges
    });

  } catch (err) {
    return res.status(500).json({
      code: 500,
      message: '获取网桥失败',
      error: err.message
    });
  }
};

/**
 * 添加
 */
export const addVMGroup = async (req, res) => {
  const {
    vm_group, description, vm_user, vm_password, rdp_port,
    template_vmid, template_name, is_full_clone, is_snapshot, vm_count,
    vm_prefix, vm_suffix, cpus, memory_mb, storage,
    network_interface, is_vlan, vlan_id,
    is_static_ip, ip_start, ip_end,
    netmask, gateway, dns1, dns2,
  } = req.body;

  try {
    // ✅ 1. 基础校验
    if (!vm_group || vm_group.trim() === '') {
      return res.status(400).json({
        code: 400,
        message: 'vm_group 不能为空'
      });
    }

    // ✅ 2. 先查询是否已存在
    const exist = await VMGroup.findOne({
      where: { vm_group }
    });

    if (exist) {
      return res.status(400).json({
        code: 400,
        message: '虚拟机组已存在'
      });
    }

    // ✅ 3. 创建
    await VMGroup.create({
      vm_group,
      description,
      vm_user,
      vm_password,
      rdp_port,
      template_vmid,
      template_name,
      is_full_clone,
      is_snapshot,
      vm_count,
      vm_prefix,
      vm_suffix,
      cpus,
      memory_mb,
      storage,
      network_interface,
      is_vlan,
      vlan_id,
      is_static_ip,
      ip_start,
      ip_end,
      netmask,
      gateway,
      dns1,
      dns2,
    });

    return res.json({
      code: 0,
      message: '添加成功'
    });

  } catch (err) {

    // ✅ 4. 防止并发情况下唯一索引冲突
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({
        code: 400,
        message: '虚拟机组已存在'
      });
    }

    return res.status(500).json({
      code: 500,
      message: '添加失败',
      error: err.message
    });
  }
};

/**
 * 根据 vm_group 获取详情
 */
export const getVMGroup = async (req, res) => {
  const { vm_group } = req.body;

  try {
    const data = await VMGroup.findOne({
      where: { vm_group }
    });

    if (!data) {
      return res.status(404).json({
        code: 404,
        message: '虚拟机组不存在'
      });
    }

    return res.json({
      code: 0,
      data
    });

  } catch (err) {
    return res.status(500).json({
      code: 500,
      message: '获取失败',
      error: err.message
    });
  }
};


/**
 * 编辑
 */
export const updateVMGroup = async (req, res) => {
  const { vm_group, ...updateData } = req.body;

  if (!vm_group || vm_group.trim() === '') {
    return res.status(400).json({
      code: 400,
      message: 'vm_group 不能为空'
    });
  }

  try {
    const [rows] = await VMGroup.update(updateData, {
      where: { vm_group }
    });

    if (rows === 0) {
      return res.status(404).json({
        code: 404,
        message: '虚拟机组不存在'
      });
    }

    return res.json({
      code: 0,
      message: '更新成功'
    });

  } catch (err) {
    return res.status(500).json({
      code: 500,
      message: '更新失败',
      error: err.message
    });
  }
};


/**
 * 获取 vm_group列表
 */
export const getAllVMGroups = async (req, res) => {
  try {
    // 查询所有记录，只选取 vm_group 和 description 两个字段
    const vmGroups = await VMGroup.findAll({
      attributes: ['vm_group', 'is_snapshot', 'description']
    });

    return res.json({
      code: 0,
      data: vmGroups
    });
  } catch (err) {
    return res.status(500).json({
      code: 500,
      message: '查询失败',
      error: err.message
    });
  }
};



/**
 * 克隆单个虚拟机
 * 传入参数：newvmid, template_vmid, is_full_clone, storage, name
 * 返回：成功返回"ok"，失败返回"fail"
 */
export const cloneSingleVM = async (newvmid, template_vmid, is_full_clone, storage, name) => {
  try {
    // 参数校验
    if (!newvmid || !template_vmid || !name) {
      console.error('参数错误：newvmid、template_vmid 和 name 不能为空');
      return "fail";
    }

    // 确保 newvmid 是整数类型
    const newid = parseInt(newvmid, 10);
    if (isNaN(newid)) {
      console.error('参数错误：newvmid 必须是整数');
      return "fail";
    }

    // 确保 template_vmid 是整数类型
    const templateId = parseInt(template_vmid, 10);
    if (isNaN(templateId)) {
      console.error('参数错误：template_vmid 必须是整数');
      return "fail";
    }

    // 解析是否为完整克隆
    const isFullClone = Boolean(
      is_full_clone === 1 ||
      is_full_clone === true ||
      is_full_clone === '1'
    );

    // 组装克隆参数
    const cloneParams = {
      newid: newid,
      full: isFullClone,
      name: name,
    };

    // 完整克隆时需要指定存储
    if (isFullClone && storage) {
      cloneParams.storage = storage;
    }

    // 调用 PVE 克隆接口
    const cloneRes = await pveRequest(
      'post',
      `/nodes/${NODE}/qemu/${templateId}/clone`,
      cloneParams
    );

    // 验证返回的 UPID
    const upid = cloneRes?.data;
    if (!upid || typeof upid !== 'string' || !upid.startsWith('UPID')) {
      console.error('未返回有效 UPID');
      return "fail";
    }

    // 轮询任务状态（最长等待 2 小时，每隔 5 秒查询一次）
    const taskResult = await waitForTask(upid, 7200000, 5000);
    
    // 根据任务结果返回状态
    if (taskResult.exitstatus === 'OK') {
      return "ok";
    } else {
      console.error('克隆失败：', taskResult.exitstatus);
      return "fail";
    }
  } catch (err) {
    console.error('cloneSingleVM 错误:', err);
    return "fail";
  }
};


/**
 * 批量克隆虚拟机
 * 实现伪并发克隆，控制并发数量，VMID获取间隔0.5秒
 */
export const batchCloneVM = async (req, res) => {
  const { vm_group } = req.body;

  try {
    // 参数校验
    if (!vm_group) {
      return res.status(400).json({
        code: 400,
        message: 'vm_group 不能为空'
      });
    }

    // 从VMGroup查询虚拟机组信息
    const vmGroup = await VMGroup.findOne({
      where: { vm_group }
    });

    if (!vmGroup) {
      return res.status(404).json({
        code: 404,
        message: '虚拟机组不存在'
      });
    }

    // 解构参数
    const {
      template_vmid,
      is_full_clone,
      vm_prefix,
      vm_suffix,
      storage,
      vm_count
    } = vmGroup;

    // 校验 vm_count
    if (!vm_count || vm_count <= 0) {
      return res.status(400).json({
        code: 400,
        message: '虚拟机组的 vm_count 必须大于 0'
      });
    }

    // 检查是否有重复名称的虚拟机
    try {
      // 获取现有的虚拟机列表
      const vmListRes = await pveRequest('get', `/nodes/${NODE}/qemu`);
      const existingVMs = vmListRes?.data || [];
      
      // 提取现有的虚拟机名称
      const existingNames = new Set(existingVMs.map(vm => vm.name).filter(Boolean));
      
      // 检查要创建的虚拟机名称是否重复
      for (let i = 0; i < vm_count; i++) {
        const name = `${vm_prefix}${vm_suffix}${i + 1}`;
        if (existingNames.has(name)) {
          return res.status(400).json({
            code: 400,
            message: `虚拟机名称已存在，禁止重复创建`
          });
        }
      }
    } catch (err) {
      console.error('检查虚拟机名称失败:', err);
      // 检查失败不阻止克隆操作，继续执行
    }

    // 获取并发限制
    const CONCURRENCY_LIMIT = getConfig('CONCURRENCY_LIMIT');
    const concurrencyLimit = parseInt(CONCURRENCY_LIMIT, 10) || 3;

    // 执行批量克隆操作
    const results = [];
    
    // 根据 is_full_clone 值决定克隆策略
    if (is_full_clone === "1") {
      // 串行克隆（完整克隆）
      console.log('使用串行克隆策略（完整克隆）');
      
      for (let i = 0; i < vm_count; i++) {
        const name = `${vm_prefix}${vm_suffix}${i + 1}`;
        
        try {
          // 获取新的 VMID
          const resvmid = await pveRequest('get', '/cluster/nextid');
          const newvmid = resvmid?.data;
          
          if (!newvmid) {
            console.error(`获取 VMID 失败，任务 ${i} 跳过`);
            results.push({
              index: i,
              newvmid: null,
              name,
              result: "fail",
              message: "获取 VMID 失败"
            });
            continue;
          }
          
          // 调用 cloneSingleVM 方法（串行执行）
          const result = await cloneSingleVM(newvmid, template_vmid, is_full_clone, storage, name);
          results.push({
            index: i,
            newvmid,
            name,
            result,
            message: result === "ok" ? "克隆成功" : "克隆失败"
          });
          
          // 每个任务间隔 0.5 秒
          if (i < vm_count - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (err) {
          console.error(`克隆任务 ${i} 失败:`, err);
          results.push({
            index: i,
            newvmid: null,
            name,
            result: "fail",
            message: `克隆失败: ${err.message}`
          });
          
          // 即使失败也保持间隔
          if (i < vm_count - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      }
    } else if (is_full_clone === "0") {
      // 并发克隆（链接克隆）
      console.log('使用并发克隆策略（链接克隆）');
      
      const runningTasks = [];
      
      // 使用并发控制器
      const activeTasks = new Set();
      
      for (let i = 0; i < vm_count; i++) {
        const name = `${vm_prefix}${vm_suffix}${i + 1}`;
        
        // 等待并发数低于限制
        while (activeTasks.size >= concurrencyLimit) {
          // 等待任一任务完成
          await Promise.race(Array.from(activeTasks));
        }

        // 创建克隆任务
        const taskPromise = (async () => {
          try {
            // 获取新的 VMID
            const resvmid = await pveRequest('get', '/cluster/nextid');
            const newvmid = resvmid?.data;
            
            if (!newvmid) {
              console.error(`获取 VMID 失败，任务 ${i} 跳过`);
              return {
                index: i,
                newvmid: null,
                name,
                result: "fail",
                message: "获取 VMID 失败"
              };
            }
            
            // 调用 cloneSingleVM 方法
            const result = await cloneSingleVM(newvmid, template_vmid, is_full_clone, storage, name);
            return {
              index: i,
              newvmid,
              name,
              result,
              message: result === "ok" ? "克隆成功" : "克隆失败"
            };
          } catch (err) {
            console.error(`克隆任务 ${i} 失败:`, err);
            return {
              index: i,
              newvmid: null,
              name,
              result: "fail",
              message: `克隆失败: ${err.message}`
            };
          }
        })();

        // 添加到活动任务集合
        activeTasks.add(taskPromise);
        
        // 任务完成后从活动任务集合中移除
        taskPromise.then(result => {
          activeTasks.delete(taskPromise);
          results.push(result);
        }).catch(err => {
          activeTasks.delete(taskPromise);
          console.error(`克隆任务 ${i} 失败:`, err);
          results.push({
            index: i,
            newvmid: null,
            name,
            result: "fail",
            message: `克隆失败: ${err.message}`
          });
        });

        // 每个克隆任务开始间隔 0.5 秒
        if (i < vm_count - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // 等待所有任务完成
      if (activeTasks.size > 0) {
        await Promise.all(Array.from(activeTasks));
      }

      // 按索引排序结果
      results.sort((a, b) => a.index - b.index);
    } else {
      // 默认使用并发克隆
      console.log('使用默认并发克隆策略');
      
      const runningTasks = [];
      
      // 使用并发控制器
      const activeTasks = new Set();
      
      for (let i = 0; i < vm_count; i++) {
        const name = `${vm_prefix}${vm_suffix}${i + 1}`;
        
        // 等待并发数低于限制
        while (activeTasks.size >= concurrencyLimit) {
          // 等待任一任务完成
          await Promise.race(Array.from(activeTasks));
        }

        // 创建克隆任务
        const taskPromise = (async () => {
          try {
            // 获取新的 VMID
            const resvmid = await pveRequest('get', '/cluster/nextid');
            const newvmid = resvmid?.data;
            
            if (!newvmid) {
              console.error(`获取 VMID 失败，任务 ${i} 跳过`);
              return {
                index: i,
                newvmid: null,
                name,
                result: "fail",
                message: "获取 VMID 失败"
              };
            }
            
            // 调用 cloneSingleVM 方法
            const result = await cloneSingleVM(newvmid, template_vmid, is_full_clone, storage, name);
            return {
              index: i,
              newvmid,
              name,
              result,
              message: result === "ok" ? "克隆成功" : "克隆失败"
            };
          } catch (err) {
            console.error(`克隆任务 ${i} 失败:`, err);
            return {
              index: i,
              newvmid: null,
              name,
              result: "fail",
              message: `克隆失败: ${err.message}`
            };
          }
        })();

        // 添加到活动任务集合
        activeTasks.add(taskPromise);
        
        // 任务完成后从活动任务集合中移除
        taskPromise.then(result => {
          activeTasks.delete(taskPromise);
          results.push(result);
        }).catch(err => {
          activeTasks.delete(taskPromise);
          console.error(`克隆任务 ${i} 失败:`, err);
          results.push({
            index: i,
            newvmid: null,
            name,
            result: "fail",
            message: `克隆失败: ${err.message}`
          });
        });

        // 每个克隆任务开始间隔 0.5 秒
        if (i < vm_count - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // 等待所有任务完成
      if (activeTasks.size > 0) {
        await Promise.all(Array.from(activeTasks));
      }

      // 按索引排序结果
      results.sort((a, b) => a.index - b.index);
    }

    // 统计成功和失败的数量
    const successCount = results.filter(r => r.result === "ok").length;
    const failCount = results.filter(r => r.result === "fail").length;

    // 返回批量克隆结果
    return res.json({
      code: 0,
      message: `批量克隆完成，成功 ${successCount} 个，失败 ${failCount} 个`,
      successCount,
      failCount,
      results
    });
  } catch (err) {
    console.error('批量克隆错误:', err);
    return res.status(500).json({
      code: 500,
      message: '批量克隆失败',
      error: err.message
    });
  }
};
