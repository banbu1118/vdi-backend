import express from 'express';
import { auth, authorize } from '../middleware/auth.js';
import {
    getImageStorages,
    getBridges, 
    addVMGroup,
    getVMGroup,
    updateVMGroup,
    getAllVMGroups,
    deleteVMGroup,
    applyVMGroup,
    rebuildVMGroup,
    rollbackVMGroup
    // batchCloneVM,
} from '../controllers/vmgroupController.js';

const router = express.Router();

router.use(auth);

//获取可用存储
router.get('/getStorages', authorize(['admin']), getImageStorages);

//获取可用网桥
router.get('/getBridges', authorize(['admin']), getBridges);

//添加虚拟机组
router.post('/addVMGroup', authorize(['admin']), addVMGroup);

//获取虚拟机组详情
router.post('/getVMGroup', authorize(['admin']), getVMGroup);

//编辑虚拟机组
router.put('/updateVMGroup', authorize(['admin']), updateVMGroup);

//获取所有虚拟机组
router.get('/getAllVMGroups', authorize(['admin']), getAllVMGroups);

// 删除虚拟机组
router.delete('/deleteVMGroup', authorize(['admin']), deleteVMGroup);

// 应用创建虚拟机
router.post('/apply', authorize(['admin']), applyVMGroup);

// 重建虚拟机组
router.post('/rebuild', authorize(['admin']), rebuildVMGroup);

// 还原虚拟机组
router.post('/rollback', authorize(['admin']), rollbackVMGroup);

//批量克隆虚拟机
// router.post('/batchCloneVM', authorize(['admin']), batchCloneVM);


export default router;
