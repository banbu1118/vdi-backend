
import { pveRequest } from '../config/pveClient.js';
import { fetchVMIP } from './getVMIP.js';
import { VM } from '../models/VM.js';
import crypto from 'crypto';
import { fetchNode } from '../services/pveService.js';

const lastSyncCache = new Map();
const CONCURRENT_IP_FETCH = 5;

// ⚙️ 生成 VM 数据哈希
const hashVM = (vm) => {
    const str = JSON.stringify([
        vm.name, vm.status, vm.cpu, vm.cpus, vm.uptime,
        vm.is_template, vm.node, vm.ip, vm.netin, vm.netout, vm.mem, vm.disk
    ]);
    return crypto.createHash('md5').update(str).digest('hex');
};

// ⚙️ 格式化 PVE 返回的虚拟机数据
const formatVMData = (vm, node) => {
    const isStoppedOrTemplate = vm.template === 1 || vm.status === 'stopped';
    return {
        vmid: vm.vmid,
        name: vm.name,
        status: isStoppedOrTemplate ? 'stopped' : vm.status,
        cpu: isStoppedOrTemplate ? 0 : vm.cpu,
        cpus: vm.cpus,
        uptime: isStoppedOrTemplate ? 0 : vm.uptime,
        is_template: vm.template === 1 ? 1 : 0,
        node: node,
        ip: null,
        netin: isStoppedOrTemplate ? 0 : vm.netin,
        netout: isStoppedOrTemplate ? 0 : vm.netout,
        mem: vm.maxmem,
        disk: vm.maxdisk,
        needFetchIP: !isStoppedOrTemplate,
    };
};

// ⚙️ 并发限制工具
const limitedMap = async (arr, limit, fn) => {
    const results = [];
    const executing = [];
    for (const item of arr) {
        const p = Promise.resolve().then(() => fn(item));
        results.push(p);

        if (limit <= arr.length) {
            const e = p.then(() => executing.splice(executing.indexOf(e), 1));
            executing.push(e);
            if (executing.length >= limit) await Promise.race(executing);
        }
    }
    return Promise.all(results);
};

// 🌐 主同步函数
export const autosyncVMs = async (silent = false) => {
    try {
        // 获取节点信息
        const NODE = await fetchNode();
        if (!NODE) {
            if (!silent) console.warn('未能获取到 PVE 节点，跳过同步');
            return { success: true };
        }

        // 1️⃣ 获取 PVE 虚拟机列表
        let vms = [];
        try {
            const resPVE = await pveRequest('get', `/nodes/${NODE}/qemu`);
            vms = Array.isArray(resPVE?.data) ? resPVE.data : [];
        } catch (err) {
            console.error('获取 PVE 虚拟机列表失败:', err.message);
            vms = [];
        }

        if (!vms.length) return { success: true };

        // 2️⃣ 格式化数据
        const newVMs = vms.map(vm => formatVMData(vm, NODE));

        // 3️⃣ 并发获取 IP
        await limitedMap(newVMs.filter(vm => vm.needFetchIP), CONCURRENT_IP_FETCH, async (vm) => {
            vm.ip = await fetchVMIP(vm.vmid).catch(() => null);
            delete vm.needFetchIP;
        });

        // 4️⃣ 初始化缓存
        if (!lastSyncCache.size) {
            const dbVMs = await VM.findAll({ raw: true });
            dbVMs.forEach(vm => lastSyncCache.set(vm.vmid, { ...vm, hash: hashVM(vm) }));
        }

        // 5️⃣ 对比新增/更新
        const toInsert = [];
        const toUpdate = [];
        newVMs.forEach(vm => {
            vm.hash = hashVM(vm);
            const oldVM = lastSyncCache.get(vm.vmid);
            if (!oldVM) {
                toInsert.push(vm);
                lastSyncCache.set(vm.vmid, vm);
            } else if (oldVM.hash !== vm.hash) {
                toUpdate.push(vm);
                lastSyncCache.set(vm.vmid, vm);
            }
        });

        // 6️⃣ 批量写入数据库
        if (toInsert.length) await VM.bulkCreate(toInsert);
        if (toUpdate.length) {
            await VM.bulkCreate(toUpdate, {
                updateOnDuplicate: [
                    'name','status','cpu','cpus','uptime','is_template',
                    'node','ip','netin','netout','mem','disk'
                ],
            });
        }

        // 7️⃣ 删除数据库中已不存在的 VM
        const currentVMIDs = new Set(newVMs.map(vm => vm.vmid));
        const vmidsToDelete = [];
        for (const [vmid] of lastSyncCache) {
            if (!currentVMIDs.has(vmid)) {
                vmidsToDelete.push(vmid);
                lastSyncCache.delete(vmid);
            }
        }
        if (vmidsToDelete.length) await VM.destroy({ where: { vmid: vmidsToDelete } });

        if (!silent) {
            console.log('自动同步虚拟机成功');
            if (vmidsToDelete.length) console.log(`删除数据库中已不存在的虚拟机: ${vmidsToDelete.join(', ')}`);
        }

        return { success: true };

    } catch (error) {
        console.error('自动同步虚拟机失败:', error.message);
        return { error: error.message };
    }
};

// 🚀 初始化并定时同步（系统启动时自动执行）
export const initVMWatcher = async () => {
    console.log('🚀 启动虚拟机同步任务...');
    await autosyncVMs(); // 启动时执行一次
    setInterval(() => {
        console.log(`🕒 [${new Date().toLocaleTimeString()}] 自动同步执行中...`);
        autosyncVMs(true);
    }, 10_000); // 每 10 秒自动执行
};

