import { pveRequest } from '../config/pveClient.js';
import { fetchNode } from '../services/pveService.js';

export const vmType = async (vmid) => {
    try {
        if (!vmid || isNaN(vmid)) {
            throw new Error("无效的 vmid 参数");
        }

        const NODE = await fetchNode();
        if (!NODE) {
            throw new Error("未能获取 PVE 节点");
        }

        const res = await pveRequest('get', `/nodes/${NODE}/qemu/${vmid}/config`);
        const ostype = res?.data?.ostype;

        if (!ostype) {
            return 'unknown';
        }

        else if (['l26', 'l24'].includes(ostype)) {
            return 'linux';
        }

        else if (['win7'].includes(ostype)) {
            return 'win7';
        }
        else if (['win8', 'win10', 'win11'].includes(ostype)) {

            return 'windows';
        }

        return 'unknown';

    } catch (err) {
        console.error(`获取虚拟机 ${vmid} 类型失败:`, err.message);
        throw err;
    }
};
