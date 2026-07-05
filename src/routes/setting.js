import express from 'express';
import { getPveConfig,configPve,getNetworkConfig,updateNetworkConfig,getPublicGatewayProxy,updatePublicGatewayProxy,getGatewayProxy,updateGatewayProxy,getRdpConfig,updateRdpConfig,updateAdminPassword,getProductVersion } from '../controllers/settingController.js';
import { auth, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(auth);

// 获取PVE连接配置：仅 admin 可操作
router.get('/pve', authorize(['admin']), getPveConfig);

// 更新PVE连接配置：仅 admin 可操作
router.post('/pve', authorize(['admin']), configPve);

// 获取网络模式：仅 admin 可操作
router.get('/ipmode', authorize(['admin']), getNetworkConfig);

// 更新网络模式：仅 admin 可操作
router.post('/ipmode', authorize(['admin']), updateNetworkConfig);

// 获取公网网关代理：仅 admin 可操作
router.get('/publicgateway', authorize(['admin']), getPublicGatewayProxy);

// 更新公网网关代理：仅 admin 可操作
router.post('/publicgateway', authorize(['admin']), updatePublicGatewayProxy);

//获取内网网关代理：仅 admin 可操作
router.get('/gateway', authorize(['admin']), getGatewayProxy);

//更新内网网关代理：仅 admin 可操作
router.post('/gateway', authorize(['admin']), updateGatewayProxy);

//获取freerdp配置：仅 admin 可操作
router.get('/rdpconf', authorize(['admin']), getRdpConfig);

//更新freerdp配置：仅 admin 可操作
router.post('/rdpconf', authorize(['admin']), updateRdpConfig);

//修改管理员密码：仅 admin 可操作
router.post('/updateadminpassword', authorize(['admin']), updateAdminPassword);

//获取产品版本信息：仅 admin 可操作
router.get('/productVersion', authorize(['admin']), getProductVersion);



export default router;
