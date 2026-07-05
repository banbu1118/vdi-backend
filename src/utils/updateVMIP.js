import { pveRequest } from '../config/pveClient.js';
import { fetchNode } from '../services/pveService.js';
import { vmType } from './vmtype.js';
import { fetchVMIP } from './getVMIP.js';
import fs from 'fs';
import path from 'path';

const __dirname = process.cwd();

let cachedNode = null;
const getNode = async () => {
    if (cachedNode) return cachedNode;
    cachedNode = await fetchNode();
    return cachedNode;
};

/** 等待 VM 运行 */
async function waitForVmRunning(vmid, timeout = 180000) {
    const NODE = await getNode();
    const start = Date.now();
    while (Date.now() - start < timeout) {
        try {
            const res = await pveRequest('get', `/nodes/${NODE}/qemu/${vmid}/status/current`);
            if (res?.data?.qmpstatus === 'running') return true;
        } catch { }
        await new Promise(r => setTimeout(r, 5000));
    }
    throw new Error('VM did not reach running state in time');
}

/** 通用等待 Guest Agent 就绪函数 */
async function waitForAgentReady(vmid, isWindows = false, timeout = 180000) {
    const NODE = await getNode();
    const start = Date.now();
    const testCmd = isWindows ? ['cmd.exe', '/c', 'echo ok'] : ['sh', '-c', 'echo ok'];

    while (Date.now() - start < timeout) {
        try {
            await pveRequest('get', `/nodes/${NODE}/qemu/${vmid}/agent/ping`);
            const resp = await pveRequest('post', `/nodes/${NODE}/qemu/${vmid}/agent/exec`, { command: testCmd });
            if (resp?.data?.pid) {
                const pid = resp.data.pid;
                for (let i = 0; i < 10; i++) {
                    const status = await pveRequest('get', `/nodes/${NODE}/qemu/${vmid}/agent/exec-status?pid=${pid}`);
                    if (status.data.exited === 1) return true;
                    await new Promise(r => setTimeout(r, 500));
                }
            }
        } catch (err) {
            console.warn(`Guest Agent not ready yet: ${err.message}, retrying...`);
        }
        await new Promise(r => setTimeout(r, 2000));
    }
    throw new Error('Guest Agent did not become ready in time');
}

/** 获取 Linux 发行版 ID（重试） */
async function getLinuxDistro(vmid, retry = 5) {
    const NODE = await getNode();
    for (let i = 0; i < retry; i++) {
        try {
            const resp = await pveRequest('post', `/nodes/${NODE}/qemu/${vmid}/agent/exec`, {
                command: ['sh', '-c', '. /etc/os-release && echo $ID']
            });
            const pid = resp.data.pid;
            await new Promise(r => setTimeout(r, 500));

            const status = await pveRequest('get', `/nodes/${NODE}/qemu/${vmid}/agent/exec-status?pid=${pid}`);
            if (status.data.exited === 1) {
                return status.data['out-data']?.trim().toLowerCase();
            }
        } catch { }
        await new Promise(r => setTimeout(r, 1000));
    }
    throw new Error('Failed to get Linux distro');
}

/** 循环写入文件 + 执行脚本 + 校验 IP + 删除脚本 */
async function applyIpUntilMatch(vmid, remotePath, execCmd, content, targetIp, maxRetry = 120) {
    const NODE = await getNode();
    for (let i = 0; i < maxRetry; i++) {
        console.log(`\n🔁 Attempt ${i + 1}/${maxRetry}`);

        try {
            await pveRequest('post', `/nodes/${NODE}/qemu/${vmid}/agent/file-write`, {
                file: remotePath,
                content: Buffer.from(content, 'utf8').toString('base64'),
                encode: '0',
            });
            console.log('✅ file-write success');
        } catch (err) {
            console.warn('❌ file-write failed:', err.message);
            await new Promise(r => setTimeout(r, 2000));
            continue;
        }

        await new Promise(r => setTimeout(r, 500));

        try {
            await pveRequest('post', `/nodes/${NODE}/qemu/${vmid}/agent/exec`, { command: execCmd });
            console.log('✅ exec success');
        } catch (err) {
            console.warn('❌ exec failed:', err.message);
            await new Promise(r => setTimeout(r, 2000));
            continue;
        }

        await new Promise(r => setTimeout(r, 2000));

        try {
            const ip = await fetchVMIP(vmid);
            console.log(`🔎 Current VM IP: ${ip}, Target IP: ${targetIp}`);
            if (ip === targetIp) {
                console.log('🎉 IP matched, finished.');

                const delCmd = remotePath.startsWith('C:')
                    ? ['cmd.exe', '/c', `del /f /q ${remotePath}`]
                    : ['rm', '-f', remotePath];

                try {
                    await pveRequest('post', `/nodes/${NODE}/qemu/${vmid}/agent/exec`, { command: delCmd });
                    console.log('🗑 Script deleted successfully.');
                } catch (delErr) {
                    console.warn('⚠ Failed to delete script:', delErr.message);
                }

                return true;
            }
        } catch (err) {
            console.warn('fetchVMIP failed, retrying...', err.message);
        }

        await new Promise(r => setTimeout(r, 2000));
    }

    throw new Error('IP did not match target value after multiple retries');
}

/** 主方法 */
export const setVmIp = async (req, res) => {
    const { vmid } = req.params;
    const { address, netmask, gateway, dns1, dns2 } = req.body;
    const NODE = await getNode();

    try {
        // 1️⃣ 启动 VM
        const statusRes = await pveRequest('get', `/nodes/${NODE}/qemu/${vmid}/status/current`);
        if (statusRes?.data?.qmpstatus !== 'running') {
            await pveRequest('post', `/nodes/${NODE}/qemu/${vmid}/status/start`);
            console.log('VM starting...');
            await waitForVmRunning(vmid);
        }
        console.log('VM is running.');

        // 2️⃣ 获取 VM 操作系统类型
        const vmOsType = await vmType(vmid);

        // 3️⃣ 等待 Guest Agent 就绪
        const isWindows = vmOsType === 'windows' || vmOsType === 'win7';
        console.log('Waiting for Guest Agent...');
        await waitForAgentReady(vmid, isWindows);
        console.log('Guest Agent ready.');

        let scriptPath, remotePath, execCmd;

        if (isWindows) {
            // Windows VM
            scriptPath = path.join(__dirname, `src/utils/templates/${vmOsType}.bat`);
            remotePath = 'C:\\Windows\\Temp\\set-ip.bat';
            execCmd = ['cmd.exe', '/c', remotePath];

            if (!fs.existsSync(scriptPath)) {
                return res.status(500).json({ message: `Windows template not found: ${scriptPath}` });
            }

        } else {
            // Linux VM
            const linuxDistro = await getLinuxDistro(vmid);
            console.log('Linux distro ID:', linuxDistro);

            scriptPath = path.join(__dirname, `src/utils/templates/${linuxDistro}.sh`);
            remotePath = '/tmp/set-ip.sh';
            execCmd = ['sh', remotePath];

            // ❌ 严格要求模板存在
            if (!fs.existsSync(scriptPath)) {
                return res.status(500).json({ 
                    message: `不支持 Linux 发行版: ${linuxDistro}`, 
                    path: scriptPath 
                });
            }
        }

        // 读取模板并替换变量
        const content = fs.readFileSync(scriptPath, 'utf8')
            .replace(/#{address}/g, address)
            .replace(/#{netmask}/g, netmask)
            .replace(/#{gateway}/g, gateway)
            .replace(/#{dns1}/g, dns1)
            .replace(/#{dns2}/g, dns2);

        console.log('Template content prepared.');

        // 应用 IP
        await applyIpUntilMatch(vmid, remotePath, execCmd, content, address, 120);

        console.log('IP successfully applied.');
        return res.json({ message: 'IP修改成功', ip: address });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'IP修改失败', error: err.message });
    }
};

/**
 * 为虚拟机设置静态IP（供批量克隆使用）
 * @param {number} vmid - 虚拟机ID
 * @param {Object} ipConfig - IP配置对象
 * @param {string} ipConfig.address - IP地址
 * @param {string} ipConfig.netmask - 子网掩码
 * @param {string} ipConfig.gateway - 网关
 * @param {string} ipConfig.dns1 - DNS1
 * @param {string} ipConfig.dns2 - DNS2
 * @returns {Promise<boolean>} - 是否成功
 */
export const setStaticIpForVM = async (vmid, ipConfig) => {
    const { address, netmask, gateway, dns1, dns2 } = ipConfig;
    const NODE = await getNode();

    try {
        // 1️⃣ 启动 VM
        const statusRes = await pveRequest('get', `/nodes/${NODE}/qemu/${vmid}/status/current`);
        if (statusRes?.data?.qmpstatus !== 'running') {
            await pveRequest('post', `/nodes/${NODE}/qemu/${vmid}/status/start`);
            console.log(`[setStaticIpForVM] VM ${vmid} starting...`);
            await waitForVmRunning(vmid);
        }
        console.log(`[setStaticIpForVM] VM ${vmid} is running.`);

        // 2️⃣ 获取 VM 操作系统类型
        const vmOsType = await vmType(vmid);

        // 3️⃣ 等待 Guest Agent 就绪
        const isWindows = vmOsType === 'windows' || vmOsType === 'win7';
        console.log(`[setStaticIpForVM] Waiting for Guest Agent...`);
        await waitForAgentReady(vmid, isWindows);
        console.log(`[setStaticIpForVM] Guest Agent ready.`);

        let scriptPath, remotePath, execCmd;

        if (isWindows) {
            // Windows VM
            scriptPath = path.join(__dirname, `src/utils/templates/${vmOsType}.bat`);
            remotePath = 'C:\\Windows\\Temp\\set-ip.bat';
            execCmd = ['cmd.exe', '/c', remotePath];

            if (!fs.existsSync(scriptPath)) {
                throw new Error(`Windows template not found: ${scriptPath}`);
            }

        } else {
            // Linux VM
            const linuxDistro = await getLinuxDistro(vmid);
            console.log(`[setStaticIpForVM] Linux distro ID:`, linuxDistro);

            scriptPath = path.join(__dirname, `src/utils/templates/${linuxDistro}.sh`);
            remotePath = '/tmp/set-ip.sh';
            execCmd = ['sh', remotePath];

            if (!fs.existsSync(scriptPath)) {
                throw new Error(`不支持 Linux 发行版: ${linuxDistro}, path: ${scriptPath}`);
            }
        }

        // 读取模板并替换变量
        const content = fs.readFileSync(scriptPath, 'utf8')
            .replace(/#{address}/g, address)
            .replace(/#{netmask}/g, netmask)
            .replace(/#{gateway}/g, gateway)
            .replace(/#{dns1}/g, dns1)
            .replace(/#{dns2}/g, dns2);

        console.log(`[setStaticIpForVM] Template content prepared.`);

        // 应用 IP
        await applyIpUntilMatch(vmid, remotePath, execCmd, content, address, 120);

        console.log(`[setStaticIpForVM] IP successfully applied to VM ${vmid}.`);
        return true;

    } catch (err) {
        console.error(`[setStaticIpForVM] Failed to set IP for VM ${vmid}:`, err);
        throw err;
    }
};
