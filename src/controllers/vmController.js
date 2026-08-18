import { pveRequest } from '../config/pveClient.js';
import { User } from '../models/User.js';
import { VM } from '../models/VM.js';
import { autosyncVMs } from '../utils/syncVMs.js';
import { fetchNode } from '../services/pveService.js';
import { waitForTask } from '../utils/pveTaskStatus.js';
import { freeVmid } from '../utils/freeVmid.js';
import { createTask, updateTask } from "../services/taskPoller.js";
import { generateSecurePassword } from '../utils/vmpassword.js';
import { getConfig } from '../utils/getConfig.js';

let cachedNode = null;
const getNode = async () => {
    if (cachedNode) return cachedNode;
    cachedNode = await fetchNode();
    return cachedNode;
};

//手动同步所有虚拟机列表
export const syncVMs = async (_req, res) => {
  try {
    await autosyncVMs();
    res.json({ code: 0, message: `手动同步虚拟机成功` });
  } catch (error) {
    res.status(500).json({ code: 500, message: `手动同步虚拟机失败`, error: error.message });
  }
}

// 获取所有虚拟机列表
export const getVMList = async (_req, res) => {
  try {

    // 查询所有虚拟机
    const result = await VM.findAll();

    res.json({ code: 0, message: `获取虚拟机列表成功`, data: result });
  } catch (error) {
    res.status(500).json({ code: 500, message: `获取虚拟机列表失败`, error: err.message });
  }
};


// 启动虚拟机
export const startVM = async (req, res) => {
  const { vmid } = req.params;

  try {
    // 1️⃣ 基本校验
    if (!vmid || isNaN(vmid)) {
      return res.status(400).json({ code: 400, message: '无效的 vmid 参数' });
    }

    // 2️⃣ 数据库是否存在
    const vm = await VM.findOne({
      where: { vmid },
      attributes: ['vmid'],
      raw: true
    });

    if (!vm) {
      return res.status(404).json({ code: 404, message: `虚拟机 ${vmid} 不存在` });
    }

    // 3️⃣ 查询虚拟机当前状态
    const statusRes = await pveRequest("get", `/nodes/${await getNode()}/qemu/${vmid}/status/current`);
    const currentStatus = statusRes?.data?.status;

    if (currentStatus === "running") {
      return res.json({ code: 0, message: `虚拟机 ${vmid} 已处于运行状态` });
    }

    // 4️⃣ 调用 PVE API 启动虚拟机
    const startRes = await pveRequest(
      "post",
      `/nodes/${await getNode()}/qemu/${vmid}/status/start`
    );

    // 提取 UPID（任务 ID）
    const upid = startRes?.data;
    if (!upid || !upid.startsWith("UPID")) {
      return res.status(500).json({
        code: 500,
        message: `启动虚拟机 ${vmid} 失败（未返回有效任务 ID）`
      });
    }

    // 5️⃣ 轮询任务状态（直到 OK / ERROR）
    const taskResult = await waitForTask(upid);

    if (taskResult.exitstatus !== "OK") {
      return res.status(500).json({
        code: 500,
        message: `虚拟机 ${vmid} 启动失败：${taskResult.exitstatus}`,
      });
    }

    // 6️⃣ 返回启动成功
    return res.json({ code: 0, message: `虚拟机 ${vmid} 启动成功` });

  } catch (err) {
    return res.status(500).json({
      code: 500,
      message: `启动虚拟机 ${vmid} 失败`,
      error: err.message,
    });
  }
};


// 关闭虚拟机
export const shutdownVM = async (req, res) => {
  const { vmid } = req.params;

  try {
    // 1️⃣ 参数校验
    if (!vmid || isNaN(vmid)) {
      return res.status(400).json({ code: 400, message: '无效的 vmid 参数' });
    }

    // 2️⃣ 数据库检查
    const vm = await VM.findOne({
      where: { vmid },
      attributes: ['vmid'],
      raw: true
    });

    if (!vm) {
      return res.status(404).json({ code: 404, message: `虚拟机 ${vmid} 不存在` });
    }

    // 3️⃣ 当前状态检查
    const statusRes = await pveRequest("get", `/nodes/${await getNode()}/qemu/${vmid}/status/current`);
    const currentStatus = statusRes?.data?.status;

    if (currentStatus === "stopped") {
      return res.json({ code: 0, message: `虚拟机 ${vmid} 已关闭` });
    }

    // 4️⃣ 调用 PVE API 执行关机
    const shutdownRes = await pveRequest(
      'post',
      `/nodes/${await getNode()}/qemu/${vmid}/status/shutdown`
    );

    // 获取任务 UPID
    const upid = shutdownRes?.data;
    if (!upid || !upid.startsWith("UPID")) {
      return res.status(500).json({
        code: 500,
        message: `虚拟机 ${vmid} 关闭失败（未返回有效 UPID）`
      });
    }

    // 5️⃣ 轮询任务结果
    const taskResult = await waitForTask(upid);

    // exitstatus != OK 就是失败
    if (taskResult.exitstatus !== "OK") {
      return res.status(500).json({
        code: 500,
        message: `虚拟机 ${vmid} 关闭失败：${taskResult.exitstatus}`
      });
    }

    // 6️⃣ 返回成功
    return res.json({ code: 0, message: `虚拟机 ${vmid} 关闭成功` });

  } catch (err) {
    return res.status(500).json({
      code: 500,
      message: `关闭虚拟机 ${vmid} 失败`,
      error: err.message,
    });
  }
};


// 停止虚拟机（强制关机，带任务轮询）
export const stopVM = async (req, res) => {
  const { vmid } = req.params;

  try {
    // 1️⃣ 参数校验
    if (!vmid || isNaN(vmid)) {
      return res.status(400).json({ code: 400, message: "无效的 vmid 参数" });
    }

    // 2️⃣ 检查数据库中是否存在该虚拟机
    const vm = await VM.findOne({
      where: { vmid },
      attributes: ["vmid"],
      raw: true,
    });

    if (!vm) {
      return res.status(404).json({ code: 404, message: `虚拟机 ${vmid} 不存在` });
    }

    // 3️⃣ 查询当前状态
    const statusRes = await pveRequest(
      "get",
      `/nodes/${await getNode()}/qemu/${vmid}/status/current`
    );
    const currentStatus = statusRes?.data?.status;

    if (currentStatus === "stopped") {
      return res.json({ code: 0, message: `虚拟机 ${vmid} 已停止` });
    }

    // 4️⃣ 调用 PVE API — 执行强制停止（会返回 UPID）
    const stopRes = await pveRequest(
      "post",
      `/nodes/${await getNode()}/qemu/${vmid}/status/stop`
    );

    const upid = stopRes?.data;
    if (!upid) {
      return res.status(500).json({
        code: 500,
        message: `未收到 PVE 返回的任务 UPID，无法跟踪任务状态`,
      });
    }

    // 5️⃣ 轮询任务状态，直到 stopped
    const finalStatus = await waitForTask(upid);

    return res.json({
      code: 0,
      message: `虚拟机 ${vmid} 停止完成`,
      upid,
      exitstatus: finalStatus.exitstatus,
    });

  } catch (err) {
    res.status(500).json({
      code: 500,
      message: `停止虚拟机 ${vmid} 失败`,
      error: err.message,
    });
  }
};


// 重启虚拟机（带任务轮询）
export const restartVM = async (req, res) => {
  const { vmid } = req.params;

  try {
    // 1️⃣ 参数合法性检查
    if (!vmid || isNaN(vmid)) {
      return res.status(400).json({ code: 400, message: '无效的 vmid 参数' });
    }

    // 2️⃣ 检查虚拟机是否存在
    const vm = await VM.findOne({
      where: { vmid },
      attributes: ['vmid'],
      raw: true
    });

    if (!vm) {
      return res.status(404).json({ code: 404, message: `虚拟机 ${vmid} 不存在` });
    }

    // 3️⃣ 获取当前虚拟机状态
    const statusRes = await pveRequest(
      'get',
      `/nodes/${await getNode()}/qemu/${vmid}/status/current`
    );

    const currentStatus = statusRes?.data?.status;

    // 4️⃣ 针对不同状态执行逻辑
    if (currentStatus === 'running') {
      // 🔄 正在运行 → 调用 reboot
      const rebootRes = await pveRequest(
        'post',
        `/nodes/${await getNode()}/qemu/${vmid}/status/reboot`
      );
      const upid = rebootRes?.data;

      if (!upid) {
        return res.status(500).json({
          code: 500,
          message: '未收到重启任务 UPID，无法进行任务状态轮询'
        });
      }

      // 轮询等待重启任务完成
      const finalStatus = await waitForTask(upid);

      return res.json({
        code: 0,
        message: `虚拟机 ${vmid} 已完成重启`,
        upid,
        exitstatus: finalStatus.exitstatus
      });
    }

    if (currentStatus === 'stopped') {
      // 🟢 已停止 → 开机
      const startRes = await pveRequest(
        'post',
        `/nodes/${await getNode()}/qemu/${vmid}/status/start`
      );

      const upid = startRes?.data;
      if (!upid) {
        return res.status(500).json({
          code: 500,
          message: '未收到启动任务 UPID，无法进行任务状态轮询'
        });
      }

      const finalStatus = await waitForTask(upid);

      return res.json({
        code: 0,
        message: `虚拟机 ${vmid} 当前为停止状态，已自动启动`,
        upid,
        exitstatus: finalStatus.exitstatus
      });
    }

    // 🟡 其他状态（如 paused、suspended）
    return res.status(400).json({
      code: 400,
      message: `虚拟机 ${vmid} 当前状态为 ${currentStatus}，无法执行重启`
    });

  } catch (err) {
    res.status(500).json({
      code: 500,
      message: `重启虚拟机 ${vmid} 失败`,
      error: err.message
    });
  }
};


// 创建虚拟机快照（带任务轮询）
export const snapshotVM = async (req, res) => {
  const { vmid } = req.params;

  try {
    // 1️⃣ 参数校验
    if (!vmid || isNaN(vmid)) {
      return res.status(400).json({ code: 400, message: '无效的 vmid 参数' });
    }

    // 2️⃣ 查库确认 vm 存在
    const vm = await VM.findOne({
      where: { vmid },
      attributes: ['vmid', 'has_snapshot'],
      raw: true
    });

    if (!vm) {
      return res.status(404).json({ code: 404, message: `虚拟机 ${vmid} 不存在` });
    }

    // 3️⃣ 查询当前虚拟机状态
    const statusRes = await pveRequest(
      'get',
      `/nodes/${await getNode()}/qemu/${vmid}/status/current`
    );

    const currentStatus = statusRes?.data?.status;

    if (currentStatus !== 'stopped') {
      return res.status(400).json({
        code: 400,
        message: `虚拟机 ${vmid} 当前状态为 ${currentStatus}，仅在停止状态下才能创建快照`,
      });
    }

    // 4️⃣ 查询已有快照
    const snapshotListRes = await pveRequest(
      'get',
      `/nodes/${await getNode()}/qemu/${vmid}/snapshot`
    );

    const snapshots = snapshotListRes?.data || [];

    const hasMilestone = snapshots.some(snap => snap.name === 'Milestone');
    if (hasMilestone) {
      return res.json({
        code: 0,
        message: `虚拟机 ${vmid} 已存在 Milestone 快照`,
      });
    }

    // 5️⃣ 创建快照（会返回 UPID）
    const snapRes = await pveRequest(
      'post',
      `/nodes/${await getNode()}/qemu/${vmid}/snapshot`,
      { snapname: 'Milestone' }
    );

    const upid = snapRes?.data;
    if (!upid) {
      return res.status(500).json({
        code: 500,
        message: 'PVE 未返回快照任务 UPID，无法进行任务状态跟踪'
      });
    }

    // 6️⃣ 轮询等待任务完成
    const finalStatus = await waitForTask(upid);

    // 7️⃣ 写数据库
    await VM.update(
      { has_snapshot: '1' },
      { where: { vmid } }
    );

    // 8️⃣ 返回成功
    return res.json({
      code: 0,
      message: `虚拟机 ${vmid} 快照创建成功`,
      upid,
      exitstatus: finalStatus.exitstatus
    });

  } catch (err) {
    return res.status(500).json({
      code: 500,
      message: `创建虚拟机 ${vmid} 快照失败`,
      error: err.message
    });
  }
};

// 查询虚拟机是否存在 Milestone 快照（仅查数据库）
export const hasMilestone = async (req, res) => {
  const { vmid } = req.params;

  try {
    // 1️⃣ 参数校验
    if (!vmid || isNaN(vmid)) {
      return res.status(400).json({
        code: 400,
        message: '无效的 vmid 参数'
      });
    }

    // 2️⃣ 查询数据库
    const vm = await VM.findOne({
      where: { vmid },
      attributes: ['vmid', 'has_snapshot'],
      raw: true
    });

    if (!vm) {
      return res.status(404).json({
        code: 404,
        message: `虚拟机 ${vmid} 不存在`
      });
    }

    // 3️⃣ 没有 Milestone 快照 → 业务失败
    if (vm.has_snapshot !== '1') {
      return res.status(400).json({
        code: 400,
        message: `虚拟机 ${vmid} 不存在 Milestone 快照`
      });
    }

    // 4️⃣ 有快照 → 成功
    return res.json({
      code: 0,
      message: `虚拟机 ${vmid} 已存在 Milestone 快照`
    });

  } catch (err) {
    return res.status(500).json({
      code: 500,
      message: `查询虚拟机 ${vmid} 快照状态失败`,
      error: err.message
    });
  }
};


// 还原虚拟机到 Milestone 快照（带任务轮询）
export const rollbackVM = async (req, res) => {
  const { vmid } = req.params;

  try {
    // 1️⃣ 参数校验
    if (!vmid || isNaN(vmid)) {
      return res.status(400).json({ code: 400, message: '无效的 vmid 参数' });
    }

    // 2️⃣ 检查数据库中虚拟机是否存在
    const vm = await VM.findOne({
      where: { vmid },
      attributes: ['vmid'],
      raw: true
    });
    if (!vm) {
      return res.status(404).json({ code: 404, message: `虚拟机 ${vmid} 不存在` });
    }

    // 3️⃣ 获取快照列表
    const snapshotListRes = await pveRequest(
      'get',
      `/nodes/${await getNode()}/qemu/${vmid}/snapshot`
    );

    const snapshots = snapshotListRes?.data || [];

    // 4️⃣ 检查 Milestone 是否存在
    const hasMilestone = snapshots.some(s => s.name === 'Milestone');
    if (!hasMilestone) {
      return res.status(400).json({
        code: 400,
        message: `虚拟机 ${vmid} 不存在名为 Milestone 的快照，无法还原`
      });
    }

    // 5️⃣ 调用恢复接口（返回 UPID）
    const rollbackRes = await pveRequest(
      'post',
      `/nodes/${await getNode()}/qemu/${vmid}/snapshot/Milestone/rollback`
    );

    const upid = rollbackRes?.data;
    if (!upid) {
      return res.status(500).json({
        code: 500,
        message: 'PVE 未返回还原任务 UPID，无法进行任务状态跟踪'
      });
    }

    // 6️⃣ 等待任务执行完成
    const finalStatus = await waitForTask(upid);

    // 7️⃣ 返回最终状态
    return res.json({
      code: 0,
      message: `虚拟机 ${vmid} 已成功还原到 Milestone 快照`,
      upid,
      exitstatus: finalStatus.exitstatus
    });

  } catch (err) {
    return res.status(500).json({
      code: 500,
      message: `还原虚拟机 ${vmid} 失败`,
      error: err.message
    });
  }
};

// 删除虚拟机（带任务轮询）
export const deleteVM = async (req, res) => {
  const { vmid } = req.params;

  try {
    // 参数校验
    if (!vmid || isNaN(vmid)) {
      return res.status(400).json({ code: 400, message: '无效的 vmid 参数' });
    }

    // 查询数据库确认虚拟机存在
    const vm = await VM.findOne({
      where: { vmid, is_template: '0' },
      attributes: ['vmid'],
      raw: true
    });

    if (!vm) {
      return res.status(404).json({ code: 404, message: `虚拟机 ${vmid} 不存在` });
    }

    // 检测当前运行状态
    let currentStatus = 'unknown';
    try {
      const statusRes = await pveRequest("get", `/nodes/${await getNode()}/qemu/${vmid}/status/current`);
      currentStatus = statusRes?.data?.status || "unknown";
    } catch (err) {
      console.warn(`[PVE] 获取虚拟机 ${vmid} 状态失败：${err.message}`);
    }

    // 如果未关闭，执行关机
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
      return res.status(500).json({
        code: 500,
        message: `虚拟机 ${vmid} 删除失败：${taskResult.exitstatus}`,
      });
    }

    // 删除数据库记录
    await VM.destroy({ where: { vmid } });

    return res.json({ code: 0, message: `虚拟机 ${vmid} 删除成功` });

  } catch (err) {
    console.error(`[deleteVM] 删除虚拟机 ${vmid} 失败：`, err);
    return res.status(500).json({
      code: 500,
      message: `虚拟机 ${vmid} 删除失败`,
      error: err.message,
    });
  }
};


// 删除模板（带任务轮询）
export const deleteTemplate = async (req, res) => {
  const { vmid } = req.params;

  try {
    // 参数校验
    if (!vmid || isNaN(vmid)) {
      return res.status(400).json({ code: 400, message: "无效的 vmid 参数" });
    }

    // 查询数据库确认模板存在
    const vm = await VM.findOne({
      where: { vmid, is_template: '1' },
      attributes: ['vmid'],
      raw: true
    });

    if (!vm) {
      return res.status(404).json({ code: 404, message: `模板 ${vmid} 不存在` });
    }

    // 调用 PVE 删除
    const result = await pveRequest(
      "delete",
      `/nodes/${await getNode()}/qemu/${vmid}`
    );

    // 得到 UPID
    const upid = result?.data;
    if (!upid || !upid.startsWith("UPID")) {
      throw new Error("PVE 未返回有效的任务 ID (UPID)");
    }

    // 等待并检查任务结果
    const taskResult = await waitForTask(upid);

    if (taskResult.exitstatus !== "OK") {
      return res.status(500).json({
        code: 500,
        message: `模板 ${vmid} 删除失败: ${taskResult.exitstatus}`,
      });
    }

    // 任务成功 → 删除数据库记录
    await VM.destroy({ where: { vmid } });

    return res.json({
      code: 0,
      message: `模板 ${vmid} 删除成功`,
    });

  } catch (err) {
    return res.status(500).json({
      code: 500,
      message: `模板 ${vmid} 删除失败`,
      error: err.message,
    });
  }
};


//获取虚拟机运行状态
export const currentstatusVM = async (req, res) => {
  const { vmid } = req.params;

  try {
    // 1️⃣ 参数校验
    if (!vmid || isNaN(vmid)) {
      return res.status(400).json({ code: 400, message: '无效的 vmid 参数' });
    }

    // 2️⃣ 检查数据库中虚拟机是否存在
    // 查询虚拟机并检查是否为模板
    const vm = await VM.findOne({ where: { vmid }, attributes: ['vmid', 'is_template'], raw: true });

    if (!vm) {
      return res.status(404).json({ code: 404, message: `虚拟机 ${vmid} 不存在` });
    }

    if (vm.is_template === '1') {
      return res.status(400).json({ code: 400, message: `虚拟机 ${vmid} 是模板，不是可操作的虚拟机` });
    }


    // 3️⃣ 查询虚拟机当前状态
    const result = await pveRequest('get', `/nodes/${await getNode()}/qemu/${vmid}/status/current`);

    // 4️⃣ 安全取值
    const status = result?.data?.qmpstatus || result?.data?.status || 'unknown';

    res.json({
      code: 0,
      message: `获取虚拟机 ${vmid} 状态成功`,
      data: { status },
    });
  } catch (err) {
    res.status(500).json({
      code: 500,
      message: `获取虚拟机 ${vmid} 状态失败`,
      error: err.message,
    });
  }
};


/**
 * 返回客户端启动 freerdp 命令
 * @param vmid - 虚拟机 ID
 * @param os - 客户端操作系统类型: windows, linux, mac, web浏览器
 */
export const getVMLoginCommand = async (req, res) => {
  const { vmid } = req.params;
 //从req中解析出用户名称
  const username = req.user.username;

  if (!vmid) {
    return res.status(400).json({ code: 400, message: '缺少 vmid 参数' });
  }

  try {
    // 通过 vmid 查找 VM，并关联绑定用户
    const vm = await VM.findOne({
      where: { vmid },
      include: [
        {
          model: User,
          attributes: ['client_type'], // 只查询 client_type
          required: true
        }
      ]
    });

    if (!vm || !vm.User || !vm.User.client_type) {
      return res.status(404).json({ code: 404, message: `vmid ${vmid} 未绑定有效用户或未配置 client_type` });
    }


    const client_type = vm.User.client_type;

    //通过username只查询用户的usb_redirect,server_to_client_clipboard和client_to_server_clipboard和client_type和drive_redirect
    const user = await User.findOne({ where: { username }, attributes: ['usb_redirect', 'server_to_client_clipboard', 'client_to_server_clipboard', 'client_type','drive_redirect'] }); 
    if (!user) {
      return res.status(404).json({ code: 404, message: `用户 ${username} 不存在` });
    }


    //根据server_to_client_clipboard和client_to_server_clipboard判断是否需要添加剪贴板重定向参数
    let clipboard_redirect = '-clipboard';
    if (user.server_to_client_clipboard === '1' && user.client_to_server_clipboard === '1') {
      clipboard_redirect = `/clipboard:direction-to:all`;
    }
    else if (user.server_to_client_clipboard === '0' && user.client_to_server_clipboard === '1') {
      clipboard_redirect = `/clipboard:direction-to:remote,files-to:remote`;
    }
    else if (user.server_to_client_clipboard === '1' && user.client_to_server_clipboard === '0') {
      clipboard_redirect = `/clipboard:direction-to:local,files-to:local`;
    }

    //mac系统判断是否需要添加存储参数
    let mac_linux_windows_drive = '';
    if ((client_type === 'mac_client' || client_type === 'linux_client') && user.drive_redirect === '1') {
      mac_linux_windows_drive = `/drive:HOME,$HOME`;
    }else if(client_type === 'win_client' && user.drive_redirect === '1'){
      mac_linux_windows_drive = `/drives`;
    }

    //根据usb_redirect判断是否需要添加usb重定向参数
    let usb_redirect = '';
    if (user.usb_redirect === '1') {
      if(client_type === 'mac_client'){
      usb_redirect = `/usb:device:*`;}
      if(client_type === 'linux_client'){
        usb_redirect = `/usb:device:*`;}
      if(client_type === 'win_client'){
        usb_redirect = `/usb:device:*`;}
    }

    //从环境变量中加载RDP_CODER
    const RDP_CODER = getConfig('RDP_CODER');

    // 根据 client_type 生成命令
    let command = '';
    switch (client_type.toLowerCase()) {
      case 'win_client':
        command = `qf-client.exe ./template.rdp  /sound:latency:200 -window-drag /${RDP_CODER} ${usb_redirect} ${clipboard_redirect} ${mac_linux_windows_drive} /cert:ignore /microphone`;
        break;
      case 'linux_client':
        command = `qf-client ./template.rdp  ${mac_linux_windows_drive} ${usb_redirect} ${clipboard_redirect} /f`;
        // console.log("linux命令:",command);
        break;
      case 'mac_client':
        // command = `sdl-freerdp ./template.rdp /cert:ignore /dynamic-resolution /scale-desktop:140 /scale:140 /sound:latency:200  /workarea /gfx /f`;
        command = `sdl3-freerdp ./template.rdp /cert:ignore /dynamic-resolution /scale:180 /scale-desktop:180 /sound:latency:200 /${RDP_CODER} ${mac_linux_windows_drive} ${usb_redirect} ${clipboard_redirect} -window-drag`;
        // console.log("mac命令:",command);
        break;
      case 'web_client':
        command = `open -a Microsoft\\ Remote\\ Desktop ./Template.rdp`;
        break;
      case 'os_client':
        command = `open -a Microsoft\\ Remote\\ Desktop ./Template.rdp`;
        break;
      default:
        return res.status(400).json({ code: 400, message: `不支持的客户端类型: ${client_type}` });
    }

    res.json({ code: 0, message: 'success', data: { command } });
  } catch (err) {
    console.error('获取 freerdp 命令失败:', err);
    res.status(500).json({ code: 500, message: '获取freerdp启动命令失败', error: err.message });
  }
};


/**
 * 更新虚拟机用户密码
 * 如果未传密码则生成16位随机密码
 */
export const updateVMPassword = async (req, res) => {
  const { vmid } = req.params;
  const { vm_user_password } = req.body;

  // 1️⃣ 基本校验
  if (!vmid || isNaN(vmid)) {
    return res.status(400).json({ code: 400, message: '无效的 vmid 参数' });
  }

  try {
    // 2️⃣ 查询虚拟机当前状态
    const statusRes = await pveRequest('get', `/nodes/${await getNode()}/qemu/${vmid}/status/current`);
    if (statusRes?.data?.status !== 'running') {
      return res.status(409).json({
        code: 409,
        message: '虚拟机未运行，无法更新密码'
      });
    }

    // 3️⃣ 检查 QEMU Guest Agent 是否就绪
    try {
      await pveRequest('post', `/nodes/${await getNode()}/qemu/${vmid}/agent/ping`);
    } catch {
      return res.status(409).json({
        code: 409,
        message: 'QEMU Guest Agent 未就绪'
      });
    }

    // 4️⃣ 查询数据库获取虚拟机信息
    const vm = await VM.findOne({
      where: { vmid },
      attributes: ['vm_user', 'name'],
      raw: true
    });

    if (!vm) {
      return res.status(404).json({ code: 404, message: `虚拟机 ${vmid} 不存在` });
    }

    const username = vm.vm_user;

    // 5️⃣ 生成密码
    const newPassword = vm_user_password && vm_user_password.length > 0
      ? vm_user_password
      : generateSecurePassword();

    // 6️⃣ 调用 Guest Agent 设置密码
    try {
      await pveRequest(
        'post',
        `/nodes/${await getNode()}/qemu/${vmid}/agent/set-user-password`,
        { username, password: newPassword }
      );
    } catch (e) {
      return res.status(502).json({
        code: 502,
        message: `虚拟机 ${vmid} 密码更新失败，请检查虚拟机是否在线并启用 QEMU Guest Agent`,
        error: e.message
      });
    }

    // 7️⃣ 数据库落库
    await VM.update(
      { vm_password: newPassword },
      { where: { vmid } }
    );

    // 8️⃣ 返回结果
    return res.json({
      code: 0,
      message: `虚拟机 ${vm.name} 密码已更新`,
      data: { vmid, username, password: newPassword }
    });

  } catch (err) {
    console.error(`[VM] 更新虚拟机密码失败: ${err.message}`);
    return res.status(500).json({
      code: 500,
      message: `更新虚拟机 ${vmid} 密码失败`,
      error: err.message
    });
  }
};

// 克隆模板虚拟机（后台执行）
export const doCloneVM = async (vmid, name, storage, taskId) => {
  try {
    const newidRes = await freeVmid();
    const newid = newidRes.data;
    if (!newid) throw new Error('未能获取可用 VMID');

    await updateTask(taskId, 'running', '正在提交克隆任务...');

    const node = await fetchNode();
    const cloneRes = await pveRequest(
      'post',
      `/nodes/${node}/qemu/${vmid}/clone`,
      { newid, name, full: 1, storage }
    );

    const upid = cloneRes?.data;
    if (!upid || typeof upid !== 'string' || !upid.startsWith('UPID')) {
      throw new Error('未返回有效 UPID');
    }

    await updateTask(taskId, 'running', `克隆任务已提交，UPID: ${upid}`);

    // 🔹 后台轮询，不阻塞
    const taskResult = await waitForTask(upid, 7200000, 5000); // 最长等待 2 小时，每隔 5 秒查询一次
    if (taskResult.exitstatus === 'OK') {
      await updateTask(taskId, 'success', `克隆成功！新 VMID = ${newid}`);
    } else {
      await updateTask(taskId, 'error', `克隆失败：${taskResult.exitstatus}`);
    }

  } catch (err) {
    await updateTask(taskId, 'error', `克隆过程中异常：${err.message}`);
  }
};


// 克隆模板虚拟机（支持任务轮询）
export const cloneTemplateVM = async (req, res) => {
  const { vmid } = req.params;
  const { name, storage } = req.body;

  try {
    if (!vmid || isNaN(vmid)) {
      return res.status(400).json({ code: 400, message: '无效的 vmid 参数' });
    }
    if (!name || !storage) {
      return res.status(400).json({ code: 400, message: '缺少 name 或 storage 参数' });
    }

    const vm = await VM.findOne({
      where: { vmid, is_template: '1' },
      attributes: ['vmid'],
      raw: true
    });
    if (!vm) {
      return res.status(404).json({ code: 404, message: `模板 ${vmid} 不存在` });
    }

    // 创建任务
    const task = await createTask('cloneVM', { vmid, name, storage });

    // 立即返回任务 ID
    res.json({ code: 0, message: '克隆任务已提交', taskId: task.id });

    // 后台执行
    doCloneVM(vmid, name, storage, task.id);

  } catch (err) {
    return res.status(500).json({ code: 500, message: '克隆模板失败', error: err.message });
  }
};


//把虚拟机转为模板（支持任务轮询）
export const convertToTemplate = async (req, res) => {
  const { vmid } = req.params;
  try {
    // 1️⃣ 参数校验
    if (!vmid || isNaN(vmid)) {
      return res.status(400).json({ code: 400, message: "无效的 vmid 参数" });
    }

    // 2️⃣ 数据库检查虚拟机存在
    const vm = await VM.findOne({
      where: { vmid },
      attributes: ["is_template"],   // 只返回 is_template 字段
      raw: true
    });


    if (!vm) {
      return res.status(404).json({ code: 404, message: `虚拟机 ${vmid} 不存在` });
    }

    if (vm.is_template === '1') {
      return res.status(400).json({ code: 400, message: `虚拟机 ${vmid} 已经是模板，无需重复转换` });
    }

    // 4️⃣ 调用 PVE 接口转为模板
    const templateRes = await pveRequest("post", `/nodes/${await getNode()}/qemu/${vmid}/template`);

    // 5️⃣ 获取任务 UPID
    const upid = templateRes?.data;
    if (!upid || !upid.startsWith("UPID")) {
      return res.status(500).json({
        code: 500,
        message: `虚拟机转为模板任务提交失败（未返回有效 UPID）`
      });
    }

    // 6️⃣ 轮询任务结果
    const taskResult = await waitForTask(upid, 60000, 1000);

    // 7️⃣ 判断任务状态
    if (taskResult.exitstatus !== "OK") {
      return res.status(500).json({
        code: 500,
        message: `虚拟机转为模板失败：${taskResult.exitstatus}`
      });
    }

    // 8️⃣ 返回成功
    return res.json({
      code: 0,
      message: `虚拟机转为模板成功`
    });

  } catch (err) {
    return res.status(500).json({
      code: 500,
      message: "虚拟机转为模板失败",
      error: err.message
    });
  }
}

// 重命名虚拟机（支持任务轮询）
export const renameVM = async (req, res) => {
  const { vmid } = req.params;
  const { newName } = req.body;

  try {
    // 1️⃣ 参数校验
    if (!vmid || isNaN(vmid)) {
      return res.status(400).json({ code: 400, message: "无效的 vmid 参数" });
    }
    if (!newName) {
      return res.status(400).json({ code: 400, message: "缺少 newName 参数" });
    }

    // 2️⃣ 数据库检查虚拟机存在
    const vm = await VM.findOne({
      where: { vmid },
      attributes: ["name"],
      raw: true
    });

    if (!vm) {
      return res.status(404).json({ code: 404, message: `虚拟机 ${vmid} 不存在` });
    }

    // 3️⃣ 调用 PVE 接口修改名称
    const renameRes = await pveRequest(
      "post",
      `/nodes/${await getNode()}/qemu/${vmid}/config`,
      { name: newName }
    );

    // 4️⃣ 获取任务 UPID
    const upid = renameRes?.data;
    if (!upid || !upid.startsWith("UPID")) {
      return res.status(500).json({
        code: 500,
        message: "修改名称任务提交失败（未返回有效 UPID）"
      });
    }

    // 5️⃣ 轮询任务结果
    const taskResult = await waitForTask(upid, 60000, 1000);

    // 6️⃣ 判断任务状态
    if (taskResult.exitstatus !== "OK") {
      return res.status(500).json({
        code: 500,
        message: `修改虚拟机名称失败：${taskResult.exitstatus}`
      });
    }

    // 7️⃣ 更新数据库
    await VM.update({ name: newName }, { where: { vmid } });

    // 8️⃣ 返回成功
    return res.json({
      code: 0,
      message: `虚拟机 ${vmid} 名称已修改为 ${newName}`
    });

  } catch (err) {
    return res.status(500).json({
      code: 500,
      message: "修改虚拟机名称失败",
      error: err.message
    });
  }
};

//更新虚拟机用户名
export const updateVMUsername = async (req, res) => {
  const { vmid } = req.params;
  const { vmusername } = req.body;
  try {
    await VM.update({ vm_user: vmusername }, { where: { vmid } });

    return res.json({
      code: 0,
      message: `虚拟机 ${vmid} 用户名已修改为 ${vmusername}`
    });
  } catch (err) {
    return res.status(500).json({
      code: 500,
      message: "修改虚拟机用户名失败",
      error: err.message
    })
  }
}

//更新RDP端口
export const updateRDPPort = async (req, res) => {
  const { vmid } = req.params;
  const { rdp_port } = req.body;
  try {
    await VM.update({ rdp_port }, { where: { vmid } });
    return res.json({
      code: 0,
      message: `虚拟机 ${vmid} RDP端口已修改为 ${rdp_port}`
    });
  } catch (err) {
    return res.status(500).json({
      code: 500,
      message: "修改虚拟机RDP端口失败",
      error: err.message
    })
  }
}
