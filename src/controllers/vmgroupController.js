import { pveRequest } from '../config/pveClient.js';
import { fetchNode } from '../services/pveService.js';
import { VMGroup } from '../models/VMGroup.js';
import { VM } from '../models/VM.js';
import { UserGroup } from '../models/UserGroup.js';
import { createTask, updateTask } from '../services/taskPoller.js';
import { waitForTask } from '../utils/pveTaskStatus.js';
import { setStaticIpForVM } from '../utils/updateVMIP.js';
import { fetchVMIP } from '../utils/getVMIP.js';
import { generateSecurePassword } from '../utils/vmpassword.js';
import { deleteVM } from './vmController.js'; // 导入deleteVM方法
import { getConfig } from '../utils/getConfig.js'; // 导入getConfig方法
import { assignVm } from '../utils/assignVm.js';

let cachedNode = null;
const getNode = async () => {
    if (cachedNode) return cachedNode;
    cachedNode = await fetchNode();
    return cachedNode;
};

// 用于跟踪正在使用中的 VMID，防止并发冲突
const reservedVmids = new Set();

// 直接从 PVE 获取下一个可用 VMID
const getNextVmidFromPVE = async () => {
  const res = await pveRequest('get', '/cluster/nextid');
  if (res?.error) {
    throw new Error(`获取 VMID 失败: ${res.details || res.error}`);
  }
  if (!res?.data) {
    throw new Error('获取 VMID 失败: 返回数据为空');
  }
  return res.data;
};

// 获取未被占用的 VMID
const getUniqueVmid = async () => {
  let attempts = 0;
  const maxAttempts = 30;

  while (attempts < maxAttempts) {
    const newid = await getNextVmidFromPVE();

    if (!newid) {
      throw new Error('未能获取可用 VMID');
    }

    // 检查这个 VMID 是否正在被其他并发任务使用
    if (!reservedVmids.has(newid)) {
      // 预留这个 VMID
      reservedVmids.add(newid);
      console.log(`[VMID分配] 成功预留 VMID: ${newid}`);
      return newid;
    }

    // 如果已被占用，等待一下再试
    console.log(`[VMID分配] VMID ${newid} 已被占用，等待重试...(${attempts + 1}/${maxAttempts})`);
    await new Promise(r => setTimeout(r, 1000));
    attempts++;
  }

  throw new Error('无法获取唯一的 VMID，请稍后重试');
};

// 释放预留的 VMID
const releaseVmid = (vmid) => {
  reservedVmids.delete(vmid);
  console.log(`[VMID分配] 释放 VMID: ${vmid}`);
};

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
    const result = await pveRequest('get', `/nodes/${await getNode()}/network`);

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


// 使用文件顶部已声明的 NODE 常量和已导入的模型

/**
 * 并发执行函数
 * @param {Array} items - 要处理的项目数组
 * @param {Function} processor - 处理函数
 * @param {number} concurrency - 并发限制
 */
const concurrentExecute = async (items, processor, concurrency) => {
  const results = [];
  const active = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    // 当活跃的任务数达到并发限制时，等待至少一个任务完成
    if (active.length >= concurrency) {
      const resolvedIndex = await Promise.race(active.map((_, idx) =>
        active[idx].promise.then(() => idx)
      ));

      // 移除已完成的任务
      active.splice(resolvedIndex, 1);
    }

    // 添加新任务
    const promise = processor(item, i).then(result => {
      results[i] = result;
      return { index: i, result };
    }).catch(error => {
      results[i] = { error: error.message };
      return { index: i, error: error.message };
    });

    active.push({
      promise,
      index: i
    });
  }

  // 等待所有剩余任务完成
  await Promise.all(active.map(task => task.promise));

  return results;
};

/**
 * 删除虚拟机组
 * 1. 从VM表中检查"group"字段为vm_group的虚拟机vmid
 * 2. 使用PVE API并发删除这些虚拟机
 * 3. 删除VMGroup表中vm_group值对应的这行数据
 */
export const deleteVMGroup = async (req, res) => {
  const { vm_group } = req.body;

  if (!vm_group) {
    return res.status(400).json({ code: 400, message: 'vm_group不能为空' });
  }

  try {
    // 先查找要删除的虚拟机组
    const group = await VMGroup.findOne({
      where: { vm_group }
    });

    if (!group) {
      return res.status(404).json({ code: 404, message: '虚拟机组不存在' });
    }

    // 步骤1: 从VM表中查找"group"字段为vm_group的虚拟机
    const vms = await VM.findAll({
      where: { group: vm_group },
      attributes: ['vmid']
    });

    // 步骤2: 如果找到虚拟机，使用PVE API并发删除
    let deletedVMCount = 0;
    if (vms.length > 0) {
      // 获取并发限制
      const concurrencyLimit = parseInt(getConfig('CONCURRENCY_LIMIT'), 10) || 5;

      // 定义处理单个虚拟机的函数
      const processVM = async (vm) => {
        const vmid = vm.vmid;

        try {
          // 检查虚拟机是否存在且不是模板
          const vmRecord = await VM.findOne({
            where: { vmid, is_template: '0' }
          });

          if (!vmRecord) {
            console.warn(`虚拟机 ${vmid} 不存在或为模板，跳过删除`);
            return { success: false, vmid, skipped: true };
          }

          // 检测当前运行状态
          let currentStatus = 'unknown';
          try {
            const statusRes = await pveRequest("get", `/nodes/${await getNode()}/qemu/${vmid}/status/current`);
            currentStatus = statusRes?.data?.status || "unknown";
          } catch (err) {
            console.warn(`[PVE] 获取虚拟机 ${vmid} 状态失败：${err.message}`);
          }

          // 如果未关闭，执行强制关机
          if (currentStatus !== "stopped") {
            await pveRequest("post", `/nodes/${await getNode()}/qemu/${vmid}/status/stop`);

            // 等待关机（最多 20 秒）
            let retry = 0;
            while (retry < 10) {
              const check = await pveRequest("get", `/nodes/${await getNode()}/qemu/${vmid}/status/current`);
              if (check?.data?.status === "stopped") break;

              await new Promise((r) => setTimeout(r, 2000));
              retry++;
            }
          }

          // 发送删除虚拟机命令
          const deleteRes = await pveRequest(
            "delete",
            `/nodes/${await getNode()}/qemu/${vmid}`
          );

          // UPID
          const upid = deleteRes?.data;
          if (!upid || !upid.startsWith("UPID")) {
            throw new Error("PVE 未返回有效 UPID，删除命令可能未成功");
          }

          // 轮询任务状态
          const taskResult = await waitForTask(upid);

          // 如果 exitstatus != OK 说明删除失败
          if (taskResult.exitstatus !== "OK") {
            throw new Error(`虚拟机 ${vmid} 删除失败：${taskResult.exitstatus}`);
          }

          // 删除数据库记录
          await VM.destroy({ where: { vmid } });

          return { success: true, vmid };

        } catch (err) {
          console.error(`删除虚拟机 ${vmid} 失败:`, err.message);
          return { success: false, vmid, error: err.message };
        }
      };

      // 并发执行删除操作
      const results = await concurrentExecute(vms, processVM, concurrencyLimit);

      // 统计成功删除的虚拟机数量
      deletedVMCount = results.filter(result => result.success).length;
    }

    // 步骤3: 删除VMGroup表中的记录
    await VMGroup.destroy({
      where: { vm_group }
    });

    //从用户组的bind_vm_group中删除vm_group
    const userGroups = await UserGroup.findAll();
    for (const userGroup of userGroups) {
      if (Array.isArray(userGroup.bind_vm_group) && userGroup.bind_vm_group.includes(vm_group)) {
        const updatedGroups = userGroup.bind_vm_group.filter(group => group !== vm_group);
        await userGroup.update({ bind_vm_group: updatedGroups });
      }
    }

    return res.json({
      code: 0,
      message: '删除成功',
      deletedVMs: deletedVMCount,
      totalVMsFound: vms.length,
      deletedGroup: true
    });

  } catch (err) {
    console.error('删除虚拟机组失败:', err);
    return res.status(500).json({
      code: 500,
      message: '删除失败',
      error: err.message
    });
  }
};

/**
 * 根据起始IP和偏移量计算IP地址
 * @param {string} ipStart - 起始IP地址（如：192.168.1.100）
 * @param {number} offset - 偏移量（从0开始）
 * @returns {string} - 计算后的IP地址
 */
const calculateIpFromStart = (ipStart, offset) => {
  const parts = ipStart.split('.');
  if (parts.length !== 4) return ipStart;

  // 将IP转换为32位整数
  let ipInt = (parseInt(parts[0]) << 24) +
    (parseInt(parts[1]) << 16) +
    (parseInt(parts[2]) << 8) +
    parseInt(parts[3]);

  // 加上偏移量
  ipInt += offset;

  // 转换回IP地址格式
  return [
    (ipInt >>> 24) & 255,
    (ipInt >>> 16) & 255,
    (ipInt >>> 8) & 255,
    ipInt & 255
  ].join('.');
};

/**
 * 修改虚拟机配置（CPU、内存、网卡、VLAN）
 * @param {string} node - PVE节点
 * @param {number} vmid - 虚拟机ID
 * @param {Object} config - 配置对象
 */
const updateVMConfig = async (node, vmid, config) => {
  const { cpus, memoryMb, networkInterface, isVlan, vlanId } = config;

  // 构建配置参数
  const configParams = {};

  // CPU 配置
  if (cpus) {
    configParams.cores = parseInt(cpus, 10);
    configParams.sockets = 1; // 默认单插槽
    configParams.vcpus = parseInt(cpus, 10); // 虚拟CPU数
  }

  // 内存配置（单位：MB）
  if (memoryMb) {
    configParams.memory = parseInt(memoryMb, 10);
  }

  // 网卡配置
  if (networkInterface) {
    // 格式：net0=virtio,bridge=vmbr0[,tag=100]
    let netConfig = `virtio,bridge=${networkInterface}`;
    if (isVlan === '1' && vlanId) {
      netConfig += `,tag=${vlanId}`;
    }
    configParams.net0 = netConfig;
  }

  console.log(`[批量克隆] 修改VM ${vmid} 配置:`, configParams);

  const configRes = await pveRequest(
    'post',
    `/nodes/${node}/qemu/${vmid}/config`,
    configParams
  );

  if (configRes?.error) {
    throw new Error(`修改VM配置失败: ${configRes.details || configRes.error}`);
  }

  // 配置修改是同步的，返回 UPID 表示后台任务
  const upid = configRes?.data;
  console.log(`[批量克隆] VM ${vmid} 配置修改返回:`, upid);

  if (upid && typeof upid === 'string' && upid.startsWith('UPID')) {
    // 等待配置修改完成
    console.log(`[批量克隆] VM ${vmid} 等待配置修改任务完成...`);
    const taskResult = await waitForTask(upid, 60000, 2000);
    if (taskResult.exitstatus !== 'OK') {
      throw new Error(`配置修改任务失败: ${taskResult.exitstatus}`);
    }
    console.log(`[批量克隆] VM ${vmid} 配置修改任务完成`);
  }

  return true;
};

/**
 * 后台执行单个虚拟机克隆
 * @param {string} templateVmid - 模板VMID
 * @param {string} vmName - 新虚拟机名称
 * @param {string} storage - 存储
 * @param {string} isFullClone - 是否完整克隆 '0'|'1'
 * @param {string} memoryMb - 内存大小(MB)
 * @param {string} cpus - CPU数量
 * @param {string} vmGroupName - 虚拟机组名称
 * @param {string} networkInterface - 网卡接口
 * @param {string} isVlan - 是否使用VLAN '0'|'1'
 * @param {string} vlanId - VLAN ID
 * @param {string} isStaticIp - 是否使用静态IP '0'|'1'
 * @param {string} ipStart - IP起始地址
 * @param {string} netmask - 子网掩码
 * @param {string} gateway - 网关
 * @param {string} dns1 - DNS1
 * @param {string} dns2 - DNS2
 * @param {number} vmIndex - 当前VM序号（用于计算IP）
 * @param {string} vmUser - 虚拟机用户名
 * @param {string} vmPassword - 虚拟机密码（为空则生成随机密码）
 * @param {string} isSnapshot - 是否启用快照 '0'|'1'
 * @param {string} taskId - 任务ID
 * @param {number} index - 当前克隆序号
 * @param {number} total - 总数
 */
// 停止并删除虚拟机（用于自动重建）
const stopAndDeleteVM = async (node, vmid, vmName) => {
  try {
    console.log(`[自动重建] 停止并删除 VM ${vmid} (${vmName})...`);

    // 1. 尝试停止虚拟机
    try {
      const statusRes = await pveRequest('get', `/nodes/${node}/qemu/${vmid}/status/current`);
      if (statusRes?.data?.status !== 'stopped') {
        await pveRequest('post', `/nodes/${node}/qemu/${vmid}/status/stop`);
        // 等待停止
        await new Promise(r => setTimeout(r, 5000));
      }
    } catch (stopErr) {
      console.log(`[自动重建] VM ${vmid} 停止失败或已停止:`, stopErr.message);
    }

    // 2. 删除虚拟机
    try {
      await pveRequest('delete', `/nodes/${node}/qemu/${vmid}`);
      // 等待删除完成
      await new Promise(r => setTimeout(r, 3000));
      console.log(`[自动重建] VM ${vmid} 删除成功`);
    } catch (deleteErr) {
      console.log(`[自动重建] VM ${vmid} 删除失败:`, deleteErr.message);
    }

    // 3. 删除数据库记录
    try {
      await VM.destroy({ where: { vmid: vmid.toString() } });
    } catch (dbErr) {
      console.log(`[自动重建] VM ${vmid} 数据库记录删除失败:`, dbErr.message);
    }
  } catch (err) {
    console.error(`[自动重建] 清理 VM ${vmid} 失败:`, err.message);
  }
};

// 用于确保VMID获取的串行化
let vmidLock = Promise.resolve();

/**
 * 串行化获取下一个可用VMID（简化版，直接使用PVE返回值）
 */
const getSerialNextVmid = async () => {
  return vmidLock = vmidLock.then(async () => {
    const res = await pveRequest('get', '/cluster/nextid');
    if (res?.error) {
      throw new Error(`获取 VMID 失败: ${res.details || res.error}`);
    }
    if (!res?.data) {
      throw new Error('获取 VMID 失败: 返回数据为空');
    }

    const vmid = res.data;
    console.log(`[动态VMID] PVE返回下一个可用VMID: ${vmid}`);
    return vmid;
  });
};

const doCloneVMForGroup = async (templateVmid, vmName, storage, isFullClone, memoryMb, cpus, vmGroupName, networkInterface, isVlan, vlanId, isStaticIp, ipStart, netmask, gateway, dns1, dns2, vmIndex, vmUser, vmPassword, isSnapshot, taskId, index, total, useDynamicVmid = false) => {
  let newid = null;
  let rebuildAttempts = 0;
  const maxRebuildAttempts = 3; // 最多重建3次（原始创建+2次重建）

  const node = await fetchNode();
  const isFull = isFullClone === '1';

  // 自动重建循环
  while (rebuildAttempts < maxRebuildAttempts) {
    rebuildAttempts++;
    if (rebuildAttempts > 1) {
      console.log(`[自动重建] 第 ${rebuildAttempts - 1} 次重建 VM ${vmName}...`);
      await updateTask(taskId, 'running', `正在重建第 ${index}/${total} 台: ${vmName} (第${rebuildAttempts - 1}次)...`);
    }

    try {
      // 步骤1-2: 克隆虚拟机
      let cloneAttempts = 0;
      const maxCloneAttempts = 3;
      let cloneSuccess = false;

      while (cloneAttempts < maxCloneAttempts && !cloneSuccess) {
        // 如果使用动态VMID获取（用于重建），则直接从PVE获取下一个可用VMID
        if (useDynamicVmid) {
          const res = await getSerialNextVmid(); // 使用串行化的VMID获取
          newid = res;
          console.log(`[动态VMID] 为虚拟机 ${vmName} 分配 VMID: ${newid}`);
        } else {
          // 如果没有预分配的VMID，则获取唯一的 VMID
          newid = await getUniqueVmid();
          if (!newid) throw new Error('未能获取可用 VMID');
        }

        await updateTask(taskId, 'running', `正在克隆第 ${index}/${total} 台: ${vmName} (VMID: ${newid})...`);

        console.log(`[批量克隆] 开始克隆: 模板=${templateVmid}, 新ID=${newid}, 名称=${vmName}, 存储=${storage}, 完整克隆=${isFull}, 尝试=${cloneAttempts + 1}/${maxCloneAttempts}`);

        // 构建克隆参数
        const cloneParams = { newid, name: vmName };
        if (isFull) {
          cloneParams.full = true;
          cloneParams.storage = storage;
        }

        try {
          const cloneRes = await pveRequest(
            'post',
            `/nodes/${node}/qemu/${templateVmid}/clone`,
            cloneParams
          );

          if (cloneRes?.error) {
            throw new Error(`PVE 克隆请求失败: ${cloneRes.details || cloneRes.error}`);
          }

          const upid = cloneRes?.data;
          if (!upid || typeof upid !== 'string' || !upid.startsWith('UPID')) {
            throw new Error('未返回有效 UPID');
          }

          const taskResult = await waitForTask(upid, 7200000, 5000);

          if (taskResult.exitstatus === 'OK') {
            cloneSuccess = true;
          } else {
            throw new Error(`克隆失败：${taskResult.exitstatus}`);
          }
        } catch (cloneErr) {
          releaseVmid(newid);
          newid = null;
          cloneAttempts++;

          if (cloneAttempts >= maxCloneAttempts) {
            throw new Error(`克隆重试 ${maxCloneAttempts} 次后仍然失败: ${cloneErr.message}`);
          }

          console.log(`[批量克隆] 克隆失败，${cloneAttempts}秒后重试: ${cloneErr.message}`);
          await new Promise(r => setTimeout(r, cloneAttempts * 1000));
        }
      }

      // 步骤3: 修改虚拟机配置
      console.log(`[批量克隆] VM ${newid} 开始配置修改...`);
      try {
        await updateVMConfig(node, newid, {
          cpus,
          memoryMb,
          networkInterface,
          isVlan,
          vlanId
        });
        console.log(`[批量克隆] VM ${newid} 配置修改成功`);
      } catch (configErr) {
        console.error(`[批量克隆] VM ${newid} 配置修改失败:`, configErr.message);
      }

      // 步骤4: 静态IP或开机
      console.log(`[批量克隆] VM ${newid} 进入步骤4...`);
      if (isStaticIp === '1' && ipStart) {
        try {
          await updateTask(taskId, 'running', `正在设置第 ${index}/${total} 台静态IP: ${vmName} (VMID: ${newid})...`);
          const currentIp = calculateIpFromStart(ipStart, vmIndex);
          console.log(`[批量克隆] 为VM ${newid} 设置静态IP: ${currentIp}`);

          await setStaticIpForVM(newid, {
            address: currentIp,
            netmask: netmask || '255.255.255.0',
            gateway: gateway || '',
            dns1: dns1 || '8.8.8.8',
            dns2: dns2 || '8.8.4.4'
          });
          console.log(`[批量克隆] VM ${newid} 静态IP设置成功: ${currentIp}`);
        } catch (ipErr) {
          console.error(`[批量克隆] VM ${newid} 静态IP设置失败:`, ipErr.message);
        }
      } else {
        try {
          await updateTask(taskId, 'running', `正在启动第 ${index}/${total} 台: ${vmName} (VMID: ${newid})...`);
          await pveRequest('post', `/nodes/${node}/qemu/${newid}/status/start`);
          console.log(`[批量克隆] VM ${newid} 启动成功`);
        } catch (startErr) {
          console.error(`[批量克隆] VM ${newid} 启动失败:`, startErr.message);
        }
      }

      // 步骤5: 设置用户密码
      let finalPassword = vmPassword;
      try {
        await updateTask(taskId, 'running', `正在设置第 ${index}/${total} 台密码: ${vmName} (VMID: ${newid})...`);
        let vmIp = null;
        for (let retry = 0; retry < 12; retry++) {
          vmIp = await fetchVMIP(newid);
          if (vmIp) break;
          await new Promise(r => setTimeout(r, 5000));
        }

        if (vmIp) {
          console.log(`[批量克隆] VM ${newid} 已获取IP: ${vmIp}，准备设置密码`);
          const password = vmPassword && vmPassword.length > 0 ? vmPassword : generateSecurePassword();
          finalPassword = password;
          await pveRequest('post', `/nodes/${node}/qemu/${newid}/agent/set-user-password`,
            { username: vmUser || 'administrator', password });
          console.log(`[批量克隆] VM ${newid} 密码设置成功`);
        }
      } catch (pwdErr) {
        console.error(`[批量克隆] VM ${newid} 密码设置失败:`, pwdErr.message);
      }

      // 写入数据库
      const memValue = parseInt(memoryMb, 10) || 4096;
      const cpusValue = cpus || '4';
      const vmidStr = newid.toString();

      const existingVM = await VM.findOne({ where: { vmid: vmidStr } });
      if (existingVM) {
        await existingVM.update({
          name: vmName,
          is_template: '0',
          group: vmGroupName || '',
          mem: memValue,
          cpus: cpusValue,
          node: node,
          vm_user: vmUser || 'administrator',
          vm_password: finalPassword || generateSecurePassword()
        });
      } else {
        await VM.create({
          vmid: vmidStr,
          name: vmName,
          is_template: '0',
          group: vmGroupName || '',
          mem: memValue,
          cpus: cpusValue,
          node: node,
          vm_user: vmUser || 'administrator',
          vm_password: finalPassword || generateSecurePassword()
        });
      }

      // 步骤6: 关机 -> (快照) -> 开机 -> 检查IP
      await updateTask(taskId, 'running', `正在完成第 ${index}/${total} 台: ${vmName} (VMID: ${newid})...`);

      try {
        // 6.1 关机
        console.log(`[批量克隆] VM ${newid} 正在关机...`);
        const shutdownRes = await pveRequest('post', `/nodes/${node}/qemu/${newid}/status/shutdown`);
        const shutdownUpid = shutdownRes?.data;
        if (shutdownUpid && typeof shutdownUpid === 'string' && shutdownUpid.startsWith('UPID')) {
          await waitForTask(shutdownUpid, 120000, 2000);
        }
        console.log(`[批量克隆] VM ${newid} 关机完成`);

        // 6.2 创建快照(如果启用)
        if (isSnapshot === '1') {
          console.log(`[批量克隆] VM ${newid} 正在创建快照...`);
          const snapRes = await pveRequest('post', `/nodes/${node}/qemu/${newid}/snapshot`, { snapname: 'Milestone' });
          const snapUpid = snapRes?.data;
          if (snapUpid && typeof snapUpid === 'string' && snapUpid.startsWith('UPID')) {
            await waitForTask(snapUpid, 300000, 2000);
          }
          console.log(`[批量克隆] VM ${newid} 快照创建完成`);
          await VM.update({ has_snapshot: '1' }, { where: { vmid: vmidStr } });
        }

        // 6.3 开机
        console.log(`[批量克隆] VM ${newid} 正在开机...`);
        const startRes = await pveRequest('post', `/nodes/${node}/qemu/${newid}/status/start`);
        const startUpid = startRes?.data;
        if (startUpid && typeof startUpid === 'string' && startUpid.startsWith('UPID')) {
          await waitForTask(startUpid, 120000, 2000);
        }
        console.log(`[批量克隆] VM ${newid} 开机完成`);

        // 6.4 检查IP
        console.log(`[批量克隆] VM ${newid} 正在检查IP...`);
        let vmIp = null;
        let ipCheckRetry = 0;
        const maxIpRetry = 24;

        while (ipCheckRetry < maxIpRetry) {
          vmIp = await fetchVMIP(newid);
          if (vmIp) break;
          await new Promise(r => setTimeout(r, 5000));
          ipCheckRetry++;
        }

        if (!vmIp) {
          throw new Error(`VM ${newid} 开机后未能获取到IP地址`);
        }

        console.log(`[批量克隆] VM ${newid} IP检查通过: ${vmIp}`);

      } catch (step6Err) {
        console.error(`[批量克隆] VM ${newid} 步骤6失败:`, step6Err.message);
        throw new Error(`步骤6失败: ${step6Err.message}`);
      }

      // 全部成功，释放VMID并返回
      releaseVmid(newid);
      return { success: true, vmid: newid, name: vmName };

    } catch (err) {
      console.error(`[批量克隆] VM ${vmName} 第 ${rebuildAttempts} 次尝试失败:`, err.message);

      // 如果还有重建次数，清理并重建
      if (rebuildAttempts < maxRebuildAttempts && newid) {
        console.log(`[自动重建] VM ${vmName} 创建失败，准备重建...`);
        await stopAndDeleteVM(node, newid, vmName);
        releaseVmid(newid);
        newid = null;
        // 等待一下再重建
        await new Promise(r => setTimeout(r, 3000));
        continue; // 重新开始循环
      }

      // 没有重建次数了，释放VMID并返回失败
      if (newid) {
        releaseVmid(newid);
      }
      return { success: false, name: vmName, error: err.message };
    }
  }

  // 如果走到这里，说明重建次数用完了
  return { success: false, name: vmName, error: '重建次数已用完' };
};

/**
 * 应用
 * 批量创建虚拟机
 */
export const applyVMGroup = async (req, res) => {
  const { vm_group } = req.body;

  if (!vm_group) {
    return res.status(400).json({ code: 400, message: 'vm_group不能为空' });
  }

  // 检查虚拟机组是否存在
  const vmGroup = await VMGroup.findOne({ where: { vm_group } });
  if (!vmGroup) {
    return res.status(400).json({ code: 400, message: '虚拟机组不存在' });
  }

  try {
    const {
      template_vmid,
      is_full_clone,
      vm_count,
      vm_prefix,
      vm_suffix,
      storage,
      memory_mb,
      cpus,
      network_interface,
      is_vlan,
      vlan_id,
      is_static_ip,
      ip_start,
      netmask,
      gateway,
      dns1,
      dns2,
      vm_user,
      vm_password,
      is_snapshot
    } = vmGroup;

    const count = parseInt(vm_count, 10);
    if (isNaN(count) || count <= 0) {
      return res.status(400).json({ code: 400, message: '虚拟机数量无效' });
    }

    // 创建批量任务
    const task = await createTask('batchCloneVM', {
      vm_group,
      template_vmid,
      count,
      storage
    });

    // 立即返回任务ID
    res.json({
      code: 0,
      message: '批量克隆任务已提交',
      taskId: task.id
    });

    // 后台执行批量克隆
    (async () => {
      // 解析后缀：保留原始格式（如 "01"），提取数字和位数
      const suffixMatch = vm_suffix?.match(/^(0*)(\d+)$/);
      const suffixNum = suffixMatch ? parseInt(suffixMatch[2], 10) : (parseInt(vm_suffix, 10) || 1);
      const suffixWidth = suffixMatch ? suffixMatch[0].length : 0; // 原始后缀的位数

      console.log(`[批量克隆] 名称生成: 前缀="${vm_prefix}", 起始后缀="${vm_suffix}", 位数=${suffixWidth}, 数量=${count}`);
      console.log(`[批量克隆] 网络配置: 静态IP=${is_static_ip}, 起始IP=${ip_start}, 网关=${gateway}`);

      // 获取并发限制
      const concurrencyLimit = parseInt(getConfig('CONCURRENCY_LIMIT'), 10) || 5;
      console.log(`[批量克隆] 并发限制: ${concurrencyLimit}`);

      // 创建所有VM的配置数组
      const vmConfigs = [];
      for (let i = 0; i < count; i++) {
        const currentSuffixNum = suffixNum + i;
        const currentSuffix = suffixWidth > 0
          ? currentSuffixNum.toString().padStart(suffixWidth, '0')
          : currentSuffixNum.toString();
        const vmName = `${vm_prefix}${currentSuffix}`;
        vmConfigs.push({
          index: i,
          vmName,
          vmIndex: i
        });
      }

      // 并发执行函数
      const runWithConcurrency = async (configs, limit) => {
        const executing = [];
        const results = [];

        for (const config of configs) {
          const { index, vmName, vmIndex } = config;

          // 创建执行任务
          const executeTask = async () => {
            console.log(`[批量克隆] 开始处理: ${vmName} (序号 ${index + 1}/${count})`);
            const result = await doCloneVMForGroup(
              template_vmid,
              vmName,
              storage,
              is_full_clone,
              memory_mb,
              cpus,
              vm_group,
              network_interface,
              is_vlan,
              vlan_id,
              is_static_ip,
              ip_start,
              netmask,
              gateway,
              dns1,
              dns2,
              vmIndex,
              vm_user,
              vm_password,
              is_snapshot,
              task.id,
              index + 1,
              count,
              false // 正常应用时不使用动态VMID获取
            );
            results[index] = result;
            return result;
          };

          // 执行任务
          const promise = executeTask();
          executing.push(promise);

          // 如果达到并发限制，等待其中一个完成
          if (executing.length >= limit) {
            await Promise.race(executing);
            // 移除已完成的任务
            executing.splice(0, executing.length - limit + 1);
          }
        }

        // 等待所有剩余任务完成
        await Promise.all(executing);

        return results;
      };

      // 执行并发克隆
      const results = await runWithConcurrency(vmConfigs, concurrencyLimit);

      // 统计结果
      const successCount = results.filter(r => r.success).length;
      const failCount = results.length - successCount;

      if (failCount === 0) {
        await updateTask(task.id, 'success', `批量克隆完成！成功 ${successCount}/${count} 台`);
      } else {
        const failedNames = results.filter(r => !r.success).map(r => r.name).join(', ');
        await updateTask(task.id, 'partial', `批量克隆完成！成功 ${successCount}/${count} 台，失败: ${failedNames}`);
      }
    })();

  } catch (err) {
    return res.status(500).json({ code: 500, message: '批量创建虚拟机失败', error: err.message });
  }
}


// 使用文件顶部已声明的 NODE 常量和已导入的模型

/**
 * 重建虚拟机组
 * 1. 查询VM表中group字段为vm_group的虚拟机vmid
 * 2. 并行删除这些虚拟机（使用deleteVM方法），同时从VM表中删除vmid这行数据记录
 * 4. 并行创建新的虚拟机，参考applyVMGroup方法使
 * 5. 确保每步操作的完整性和数据一致性
 */
export const rebuildVMGroup = async (req, res) => {
  const { vm_group } = req.body;
  if (!vm_group) {
    return res.status(400).json({ code: 400, message: 'vm_group不能为空' });
  }

  try {
    // 检查虚拟机组是否存在
    const vmGroup = await VMGroup.findOne({ where: { vm_group } });
    if (!vmGroup) {
      return res.status(404).json({ code: 404, message: '虚拟机组不存在' });
    }

    // 创建重建任务
    const task = await createTask('rebuildVMGroup', {
      vm_group,
      template_vmid: vmGroup.template_vmid,
      count: vmGroup.vm_count
    });

    // 立即返回任务ID
    res.json({
      code: 0,
      message: '重建虚拟机组任务已提交',
      taskId: task.id
    });

    // 后台执行重建操作
    (async () => {
      try {
        await updateTask(task.id, 'running', `开始重建虚拟机组 ${vm_group}...`);

        // 步骤1: 查询VM表中group字段为vm_group的虚拟机vmid
        const vms = await VM.findAll({
          where: { group: vm_group },
          attributes: ['vmid']
        });

        // 步骤2: 并行删除这些虚拟机（使用deleteVM方法），同时从VM表中删除vmid这行数据记录
        if (vms.length > 0) {
          await updateTask(task.id, 'running', `正在删除旧虚拟机... (共 ${vms.length} 台)`);
          console.log(`[重建虚拟机组] 开始删除旧虚拟机，共 ${vms.length} 台: ${vms.map(vm => vm.vmid).join(', ')}`);

          // 定义处理单个虚拟机删除的函数
          const processDeleteVM = async (vm) => {
            const vmid = vm.vmid;
            console.log(`[重建虚拟机组][DEBUG] 开始处理删除虚拟机: ${vmid}`);

            try {
              // 调用deleteVM方法删除虚拟机
              // 注意：deleteVM使用params获取vmid，而不是body
              const mockReq = { params: { vmid } };
              const mockRes = {
                status: (code) => ({
                  json: (data) => console.log(`[deleteVM][DEBUG] 响应: ${code}, ${JSON.stringify(data)}`)
                }),
                json: (data) => console.log(`[deleteVM][DEBUG] 响应: ${JSON.stringify(data)}`)
              };

              console.log(`[重建虚拟机组][DEBUG] 调用deleteVM删除虚拟机: ${vmid}`);
              await deleteVM(mockReq, mockRes);
              console.log(`[重建虚拟机组][DEBUG] 成功删除虚拟机: ${vmid}`);
              return { success: true, vmid };
            } catch (err) {
              console.error(`[重建虚拟机组][DEBUG] 删除虚拟机 ${vmid} 失败:`, err.message);
              return { success: false, vmid, error: err.message };
            }
          };

          // 获取并发限制
          const concurrencyLimit = parseInt(getConfig('CONCURRENCY_LIMIT'), 10) || 5;
          console.log(`[重建虚拟机组][DEBUG] 删除操作并发限制: ${concurrencyLimit}`);
          // 并行执行删除操作
          console.log(`[重建虚拟机组][DEBUG] 开始并行删除操作`);
          const deleteResults = await concurrentExecute(vms, processDeleteVM, concurrencyLimit);

          // 统计删除结果
          const deletedCount = deleteResults.filter(r => r.success).length;
          const failedDeletes = deleteResults.filter(r => !r.success);
          console.log(`[重建虚拟机组][DEBUG] 删除完成：成功 ${deletedCount}/${vms.length} 台`);
          if (failedDeletes.length > 0) {
            console.log(`[重建虚拟机组][DEBUG] 删除失败的虚拟机: ${failedDeletes.map(d => d.vmid).join(', ')}`);
          }
        }

        // 步骤3: 并行创建新的虚拟机，参考applyVMGroup方法
        await updateTask(task.id, 'running', '开始创建新虚拟机...');

        const {
          template_vmid,
          is_full_clone,
          vm_count,
          vm_prefix,
          vm_suffix,
          storage,
          memory_mb,
          cpus,
          network_interface,
          is_vlan,
          vlan_id,
          is_static_ip,
          ip_start,
          netmask,
          gateway,
          dns1,
          dns2,
          vm_user,
          vm_password,
          is_snapshot
        } = vmGroup;

        const count = parseInt(vm_count, 10);
        if (isNaN(count) || count <= 0) {
          throw new Error('虚拟机数量无效');
        }

        // 解析后缀：保留原始格式（如 "01"），提取数字和位数
        const suffixMatch = vm_suffix?.match(/^(0*)(\d+)$/);
        const suffixNum = suffixMatch ? parseInt(suffixMatch[2], 10) : (parseInt(vm_suffix, 10) || 1);
        const suffixWidth = suffixMatch ? suffixMatch[0].length : 0; // 原始后缀的位数

        console.log(`[重建虚拟机组] 名称生成: 前缀="${vm_prefix}", 起始后缀="${vm_suffix}", 位数=${suffixWidth}, 数量=${count}`);

        // 创建所有VM的配置数组
        const vmConfigs = [];
        for (let i = 0; i < count; i++) {
          const currentSuffixNum = suffixNum + i;
          const currentSuffix = suffixWidth > 0
            ? currentSuffixNum.toString().padStart(suffixWidth, '0')
            : currentSuffixNum.toString();
          const vmName = `${vm_prefix}${currentSuffix}`;
          vmConfigs.push({
            index: i,
            vmName,
            vmIndex: i
          });
        }
        console.log(`[重建虚拟机组][DEBUG] 准备创建 ${count} 台虚拟机: ${vmConfigs.map(c => c.vmName).join(', ')}`);

        // 并发执行函数
        const runWithConcurrency = async (configs, limit) => {
          const executing = [];
          const results = [];

          for (const config of configs) {
            const { index, vmName, vmIndex } = config;

            // 创建执行任务
            const executeTask = async () => {
              console.log(`[重建虚拟机组][DEBUG] 开始创建: ${vmName} (序号 ${index + 1}/${count})`);
              try {
                console.log(`[重建虚拟机组][DEBUG] 调用doCloneVMForGroup创建虚拟机: ${vmName}`);
                console.log(`[重建虚拟机组][DEBUG] 克隆参数: template_vmid=${template_vmid}, storage=${storage}, is_full_clone=${is_full_clone}`);

                const result = await doCloneVMForGroup(
                  template_vmid,
                  vmName,
                  storage,
                  is_full_clone,
                  memory_mb,
                  cpus,
                  vm_group,
                  network_interface,
                  is_vlan,
                  vlan_id,
                  is_static_ip,
                  ip_start,
                  netmask,
                  gateway,
                  dns1,
                  dns2,
                  vmIndex,
                  vm_user,
                  vm_password,
                  is_snapshot,
                  task.id,
                  index + 1,
                  count,
                  true // 重建时使用动态VMID获取
                );

                results[index] = result;
                console.log(`[重建虚拟机组][DEBUG] 成功创建虚拟机: ${result.vmid} (${result.name})`);
                return result;
              } catch (err) {
                console.error(`[重建虚拟机组][DEBUG] 创建虚拟机 ${vmName} 失败:`, err.message);
                results[index] = { success: false, name: vmName, error: err.message };
                return { success: false, name: vmName, error: err.message };
              }
            };

            // 执行任务
            const promise = executeTask();
            executing.push(promise);
            console.log(`[重建虚拟机组][DEBUG] 添加创建任务到执行队列: ${vmName}, 当前执行任务数: ${executing.length}`);

            // 如果达到并发限制，等待其中一个完成
            if (executing.length >= limit) {
              console.log(`[重建虚拟机组][DEBUG] 达到并发限制 ${limit}，等待任务完成...`);
              await Promise.race(executing);
              // 移除已完成的任务
              executing.splice(0, executing.length - limit + 1);
              console.log(`[重建虚拟机组][DEBUG] 任务完成，执行队列剩余: ${executing.length} 个任务`);
            }
          }

          // 等待所有剩余任务完成
          console.log(`[重建虚拟机组][DEBUG] 等待剩余 ${executing.length} 个任务完成...`);
          await Promise.all(executing);
          console.log(`[重建虚拟机组][DEBUG] 所有创建任务完成`);

          return results;
        };

        // 获取并发限制
        const concurrencyLimit = parseInt(getConfig('CONCURRENCY_LIMIT'), 10) || 5;
        console.log(`[重建虚拟机组][DEBUG] 创建操作并发限制: ${concurrencyLimit}`);

        // 执行并发创建
        console.log(`[重建虚拟机组][DEBUG] 开始并行创建虚拟机`);
        const createResults = await runWithConcurrency(vmConfigs, concurrencyLimit);
        console.log(`[重建虚拟机组][DEBUG] 并行创建操作完成`);

        // 步骤4: 确保每步操作的完整性和数据一致性
        // 统计结果
        const successCount = createResults.filter(r => r.success).length;
        const failCount = createResults.length - successCount;
        const failedVMs = createResults.filter(r => !r.success);

        console.log(`[重建虚拟机组][DEBUG] 重建结果统计: 成功 ${successCount} 台, 失败 ${failCount} 台`);
        if (failedVMs.length > 0) {
          console.log(`[重建虚拟机组][DEBUG] 失败的虚拟机详情:`);
          failedVMs.forEach(vm => {
            console.log(`[重建虚拟机组][DEBUG] - ${vm.name}: ${vm.error}`);
          });
        }

        if (failCount === 0) {
          await updateTask(task.id, 'success', `重建虚拟机组完成！成功 ${successCount}/${count} 台`);
          console.log(`[重建虚拟机组] 重建完成！成功 ${successCount}/${count} 台`);
        } else {
          const failedNames = failedVMs.map(r => r.name).join(', ');
          await updateTask(task.id, 'partial', `重建虚拟机组完成！成功 ${successCount}/${count} 台，失败: ${failedNames}`);
          console.log(`[重建虚拟机组] 重建完成！成功 ${successCount}/${count} 台，失败: ${failedNames}`);
        }

        //重新分配虚拟组给用户组

        // 重新分配虚拟组给用户组
  const userGroups = await UserGroup.findAll();

  for (const userGroup of userGroups) {
    const bindGroups = userGroup.bind_vm_group;

    // 判空 + 类型校验
    if (!Array.isArray(bindGroups) || bindGroups.length === 0) {
      continue;
    }

    // 判断是否包含目标虚拟组
    if (bindGroups.includes(vm_group)) {
      try {
        // 按你的要求传数组
        console.log('开始分配虚拟机组');
        
        await assignVm(userGroup, [vm_group]);

        console.log('分配完成')
      } catch (err) {
        console.error(`分配虚拟组失败 userGroup=${userGroup.id}`, err);
      }
    }
  }




      } catch (err) {
        console.error(`[重建虚拟机组] 任务失败:`, err.message);
        await updateTask(task.id, 'error', `重建虚拟机组失败: ${err.message}`);
      }
    })();

  } catch (err) {
    console.error(`[重建虚拟机组] 启动失败:`, err.message);
    return res.status(500).json({ code: 500, message: '重建虚拟机组失败', error: err.message });
  }
};


/**
 * 还原虚拟机组
 * 1.查询VMGROUP表中is_snapshot字段的值
 * 2.如果is_snapshot为字符串"0"，则报错"该虚拟机组未创建快照，无法还原"
 * 3.如果is_snapshot为字符串"1"，则查询VM表中group字段为vm_group的虚拟机vmid
 * 4. 并行停止这些虚拟机（使用stopVM方法），还原这些虚拟机（使用rollbackVM方法），还原成功后启动虚拟机（使用startVM方法）
 * 5.确保每步操作的完整性和数据一致性
 */
export const rollbackVMGroup = async (req, res) => {
  const { vm_group } = req.body;
  if (!vm_group) {
    return res.status(400).json({ code: 400, message: 'vm_group不能为空' });
  }

  try {
    // 步骤1: 查询VMGROUP表中is_snapshot字段的值
    const vmGroup = await VMGroup.findOne({ where: { vm_group } });
    if (!vmGroup) {
      return res.status(404).json({ code: 404, message: '虚拟机组不存在' });
    }

    // 步骤2: 检查is_snapshot字段
    if (vmGroup.is_snapshot === '0') {
      return res.status(400).json({ code: 400, message: '该虚拟机组未创建快照，无法还原' });
    }

    // 创建还原任务
    const task = await createTask('rollbackVMGroup', {
      vm_group,
      count: 0 // 后续更新
    });

    // 立即返回任务ID
    res.json({
      code: 0,
      message: '还原虚拟机组任务已提交',
      taskId: task.id
    });

    // 后台执行还原操作
    (async () => {
      try {
        await updateTask(task.id, 'running', `开始还原虚拟机组 ${vm_group}...`);

        // 步骤3: 查询VM表中group字段为vm_group的虚拟机vmid
        const vms = await VM.findAll({
          where: { group: vm_group },
          attributes: ['vmid']
        });

        if (vms.length === 0) {
          await updateTask(task.id, 'success', `虚拟机组 ${vm_group} 中没有虚拟机需要还原`);
          console.log(`[还原虚拟机组] 虚拟机组 ${vm_group} 中没有虚拟机需要还原`);
          return;
        }

        // 更新任务中的虚拟机数量
        await createTask('rollbackVMGroup', {
          vm_group,
          count: vms.length
        });

        await updateTask(task.id, 'running', `正在还原虚拟机... (共 ${vms.length} 台)`);
        console.log(`[还原虚拟机组] 开始还原 ${vms.length} 台虚拟机: ${vms.map(vm => vm.vmid).join(', ')}`);

        // 定义处理单个虚拟机停止、还原和启动的函数
        const processStopRollbackAndStart = async (vm) => {
          const vmid = vm.vmid;
          console.log(`[还原虚拟机组][DEBUG] 开始处理虚拟机: ${vmid}`);

          try {
            // 步骤4.1: 停止虚拟机（使用stopVM方法）
            console.log(`[还原虚拟机组][DEBUG] 调用stopVM停止虚拟机: ${vmid}`);
            const stopReq = { params: { vmid } };
            const stopRes = {
              status: (code) => ({
                json: (data) => console.log(`[stopVM][DEBUG] 响应: ${code}, ${JSON.stringify(data)}`)
              }),
              json: (data) => console.log(`[stopVM][DEBUG] 响应: ${JSON.stringify(data)}`)
            };

            // 动态导入stopVM方法
            const { stopVM } = await import('./vmController.js');
            await stopVM(stopReq, stopRes);
            console.log(`[还原虚拟机组][DEBUG] 成功停止虚拟机: ${vmid}`);

            // 步骤4.2: 还原虚拟机（使用rollbackVM方法）
            console.log(`[还原虚拟机组][DEBUG] 调用rollbackVM还原虚拟机: ${vmid}`);
            const rollbackReq = { params: { vmid } };
            const rollbackRes = {
              status: (code) => ({
                json: (data) => console.log(`[rollbackVM][DEBUG] 响应: ${code}, ${JSON.stringify(data)}`)
              }),
              json: (data) => console.log(`[rollbackVM][DEBUG] 响应: ${JSON.stringify(data)}`)
            };

            // 动态导入rollbackVM方法
            const { rollbackVM } = await import('./vmController.js');
            await rollbackVM(rollbackReq, rollbackRes);
            console.log(`[还原虚拟机组][DEBUG] 成功还原虚拟机: ${vmid}`);

            // 步骤4.3: 启动虚拟机（使用startVM方法）
            console.log(`[还原虚拟机组][DEBUG] 调用startVM启动虚拟机: ${vmid}`);
            const startReq = { params: { vmid } };
            const startRes = {
              status: (code) => ({
                json: (data) => console.log(`[startVM][DEBUG] 响应: ${code}, ${JSON.stringify(data)}`)
              }),
              json: (data) => console.log(`[startVM][DEBUG] 响应: ${JSON.stringify(data)}`)
            };

            // 动态导入startVM方法
            const { startVM } = await import('./vmController.js');
            await startVM(startReq, startRes);
            console.log(`[还原虚拟机组][DEBUG] 成功启动虚拟机: ${vmid}`);

            return { success: true, vmid };
          } catch (err) {
            console.error(`[还原虚拟机组][DEBUG] 处理虚拟机 ${vmid} 失败:`, err.message);
            return { success: false, vmid, error: err.message };
          }
        };

        // 获取并发限制
        const concurrencyLimit = parseInt(getConfig('CONCURRENCY_LIMIT'), 10) || 5;
        console.log(`[还原虚拟机组][DEBUG] 还原操作并发限制: ${concurrencyLimit}`);

        // 并行执行停止、还原和启动操作
        console.log(`[还原虚拟机组][DEBUG] 开始并行停止、还原和启动操作`);
        const results = await concurrentExecute(vms, processStopRollbackAndStart, concurrencyLimit);

        // 步骤5: 确保每步操作的完整性和数据一致性
        // 统计结果
        const successCount = results.filter(r => r.success).length;
        const failedCount = results.length - successCount;
        const failedVMs = results.filter(r => !r.success);

        console.log(`[还原虚拟机组][DEBUG] 还原结果统计: 成功 ${successCount} 台, 失败 ${failedCount} 台`);
        if (failedVMs.length > 0) {
          console.log(`[还原虚拟机组][DEBUG] 失败的虚拟机详情:`);
          failedVMs.forEach(vm => {
            console.log(`[还原虚拟机组][DEBUG] - ${vm.vmid}: ${vm.error}`);
          });
        }

        if (failedCount === 0) {
          await updateTask(task.id, 'success', `还原虚拟机组完成！成功 ${successCount}/${vms.length} 台`);
          console.log(`[还原虚拟机组] 还原完成！成功 ${successCount}/${vms.length} 台`);
        } else {
          const failedVmids = failedVMs.map(r => r.vmid).join(', ');
          await updateTask(task.id, 'partial', `还原虚拟机组完成！成功 ${successCount}/${vms.length} 台，失败: ${failedVmids}`);
          console.log(`[还原虚拟机组] 还原完成！成功 ${successCount}/${vms.length} 台，失败: ${failedVmids}`);
        }

      } catch (err) {
        console.error(`[还原虚拟机组] 任务失败:`, err.message);
        await updateTask(task.id, 'error', `还原虚拟机组失败: ${err.message}`);
      }
    })();

  } catch (err) {
    console.error(`[还原虚拟机组] 启动失败:`, err.message);
    return res.status(500).json({ code: 500, message: '还原虚拟机组失败', error: err.message });
  }
};  
