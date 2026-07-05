import { pveRequest } from '../config/pveClient.js';
import { VM } from '../models/VM.js';
import { fetchNode } from '../services/pveService.js';

export const fetchVMIP = async (vmid) => {
  const NODE = await fetchNode();
  if (!NODE) return null;

  const timeout = 3000; // 3 秒超时

  const fetchPromise = (async () => {
    const response = await pveRequest(
      'get',
      `/nodes/${NODE}/qemu/${vmid}/agent/network-get-interfaces`
    );

    const interfaces = response.data?.result;
    if (!interfaces || !Array.isArray(interfaces)) return null;

    // 遍历每个接口
    for (const iface of interfaces) {
      const name = iface.name?.toLowerCase() || '';
      if (name.includes('lo') || name.includes('loopback')) continue;

      const ipAddresses = iface['ip-addresses'] || [];
      for (const ipObj of ipAddresses) {
        const ip = ipObj['ip-address'];
        if (
          ipObj['ip-address-type'] === 'ipv4' &&
          ip &&
          !ip.startsWith('127.') &&
          !ip.startsWith('169.254.')
        ) {
          return ip; // 找到第一个有效 IPv4 立即返回
        }
      }
    }

    return null; // 没找到有效 IPv4
  })();

  // 超时 Promise
  const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), timeout));

  return Promise.race([fetchPromise, timeoutPromise]);
};


// API 接口调用 fetchVMIP
// export const getVMIP = async (req, res) => {
//   const { vmid } = req.params;
//   try {
//     const ip = await fetchVMIP(vmid);
//     if (!ip) return res.status(404).json({ code: 404, message: '虚拟机 IPv4 地址未获取到' });

//     res.json({ code: 0, message: 'success', data: { ip } });
//   } catch (err) {
//     console.error('[VM] 获取虚拟机 IP 失败:', err);
//     res.status(500).json({ code: 500, message: '获取虚拟机 IP 失败', error: err.message });
//   }
// };

export const getVMIP = async (req, res) => {
  const { vmid } = req.params;

  // 1️⃣ 检查 vmid 是否存在
  if (!vmid) {
    return res.status(400).json({ code: 400, message: 'vmid 参数缺失' });
  }

  // 2️⃣ 检查 vmid 是否为有效数字
  const vmidNum = parseInt(vmid, 10);
  if (isNaN(vmidNum) || vmidNum <= 0) {
    return res.status(400).json({ code: 400, message: 'vmid 参数无效' });
  }

  try {
    // 3️⃣ 查询数据库确认 VM 是否存在，并检查是否为模板
    const vm = await VM.findOne({
      where: { vmid: vmidNum },
      attributes: ['vmid', 'name', 'is_template'] // 只查询必要字段
    });

    if (!vm) {
      return res.status(404).json({ code: 404, message: `虚拟机 ${vmid} 不存在` });
    }

    if (vm.is_template === 1 || vm.is_template === '1') {
      return res.status(400).json({ code: 400, message: `虚拟机 ${vmid} 为模板，没有 IP` });
    }

    // 4️⃣ 获取 IP
    const ip = await fetchVMIP(vmidNum);
    if (!ip) {
      return res.status(404).json({ code: 404, message: '虚拟机 IPv4 地址未获取到' });
    }

    res.json({ code: 0, message: 'success', data: { ip } });

  } catch (err) {
    console.error(`[VM] 获取虚拟机 IP 失败 (vmid=${vmid}):`, err);
    res.status(500).json({ code: 500, message: '获取虚拟机 IP 失败', error: err.message });
  }
};