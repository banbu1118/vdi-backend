import express from 'express';
import {
    syncVMs,
    getVMList,
    getAdminVMList,
    startVM,
    shutdownVM,
    stopVM,
    restartVM,
    snapshotVM,
    rollbackVM,
    deleteVM,
    deleteTemplate,
    currentstatusVM,
    getVMLoginCommand,
    updateVMPassword,
    cloneTemplateVM,
    convertToTemplate,
    renameVM,
    updateVMUsername,
    updateRDPPort,
    hasMilestone,
    importTemplate,
    exportTemplate
} from '../controllers/vmController.js';
import { getVMIP } from '../utils/getVMIP.js'
import { auth, authorize } from '../middleware/auth.js';
import { getVMRDP } from '../utils/getVMRDP.js';
import { setVmIp } from '../utils/updateVMIP.js';

const router = express.Router();

router.use(auth);

// admin特权用户允许访问所有接口
router.get('/', authorize(['admin']), getVMList);

// ✅ 仅管理员能同步
router.post('/sync', authorize(['admin']), syncVMs);

// 获取用户为 admin 的虚拟机列表
router.get('/admin/vms', authorize(['admin']), getAdminVMList);

// 普通用户允许访问部分接口
router.post('/:vmid/start', authorize(['admin', 'user']), startVM);
router.post('/:vmid/shutdown', authorize(['admin', 'user']), shutdownVM);
router.post('/:vmid/stop', authorize(['admin', 'user']), stopVM);
router.post('/:vmid/restart', authorize(['admin', 'user']), restartVM);

// 普通用户允许访问部分接口
//快照接口部分
router.post('/:vmid/snapshot', authorize(['admin', 'user']), snapshotVM);
router.post('/:vmid/rollback', authorize(['admin', 'user']), rollbackVM);
//查询虚拟机是否包含名为Milestone的快照
router.get('/:vmid/hasmilestone', authorize(['admin', 'user']), hasMilestone);

// 删除虚拟机
router.delete('/:vmid', authorize(['admin']), deleteVM);

// 删除模板
router.delete('/template/:vmid', authorize(['admin']), deleteTemplate);

//获取虚拟机运行状态
router.get('/:vmid/currentstatus', authorize(['admin', 'user']), currentstatusVM);

// 获取虚拟机 IP 地址
router.get('/:vmid/ip', authorize(['admin']), getVMIP);

// 获取虚拟机 RDP文件
router.get('/:vmid/rdp', authorize(['admin', 'user']), getVMRDP);

// 返回 freerdp 启动命令
router.get('/:vmid/login', authorize(['admin', 'user']), getVMLoginCommand);

//更新虚拟机密码
router.post('/:vmid/password', authorize(['admin']), updateVMPassword);

//克隆模板虚拟机
router.post('/template/:vmid/clone', authorize(['admin']), cloneTemplateVM);

//导入模板（raw body 流式上传备份文件并恢复为模板）
router.post('/template/import', authorize(['admin']), importTemplate);

//导出模板（PVE 备份后 ssh2 流式下载，响应体即文件）
router.post('/template/:vmid/export', authorize(['admin']), exportTemplate);

//虚拟机转换为模板
router.post('/:vmid/template', authorize(['admin']), convertToTemplate);

//重命名虚拟机
router.post('/:vmid/rename', authorize(['admin']), renameVM);

//修改虚拟机ip
router.post('/:vmid/ip', authorize(['admin']), setVmIp);

//更新虚拟机用户名
router.post('/:vmid/vmusername', authorize(['admin']), updateVMUsername);

//更新RDP端口
router.post('/:vmid/rdpport', authorize(['admin']), updateRDPPort);

export default router;
