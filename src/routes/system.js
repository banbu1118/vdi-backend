import express from 'express';
import { getNode,getStorage,getStorageUsage,getSystemInfo,getNodeStatus,getPveIp } from '../controllers/systemController.js';
import { auth, authorize } from '../middleware/auth.js';

const router = express.Router();
router.use(auth);

// 获取pve节点
router.get('/node', authorize('admin'), getNode);

// 获取pve存储
router.get('/storage', authorize('admin'), getStorage);

// 获取pve存储使用情况
router.get('/storage/usage', authorize('admin'), getStorageUsage);

// 获取pve系统信息
router.get('/info', authorize('admin'), getSystemInfo);

// 获取pve节点状态
router.get('/node/status', authorize('admin'), getNodeStatus);

//获取ip地址
router.get('/pveip', authorize('admin'), getPveIp);

export default router;
