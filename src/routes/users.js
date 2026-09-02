import express from 'express';
import { createUser, deleteUser, changePassword, assignVMToUser, unassignVMFromUser, getUserVMs, getAllUsers, batchCreateUsers, createSingleUser, updateUser,disableUser,unlockUser } from '../controllers/userController.js';
import { auth, authorize } from '../middleware/auth.js';
import { handleHeartbeat } from '../utils/heartbeat.js';

const router = express.Router();

router.use(auth);

// 创建用户：仅 admin 可操作
router.post('/', authorize(['admin']), createUser);

// 批量创建用户：仅 admin 可操作
router.post('/batch', authorize(['admin']), batchCreateUsers);

// 创建单个用户：仅 admin 可操作
router.post('/single', authorize(['admin']), createSingleUser);

// 更新用户信息：仅 admin 可操作
router.post('/updateUser', authorize(['admin']), updateUser);

//禁用/启用用户：仅 admin 可操作
router.post('/disableUser', authorize(['admin']), disableUser);

//解除用户锁定：仅 admin 可操作
router.post('/unlockUser', authorize(['admin']), unlockUser);



// 删除用户：仅 admin 可操作
router.delete('/:username', authorize(['admin']), deleteUser);

// 修改密码：admin 可修改任意用户，普通用户只能修改自己
router.put('/password', authorize(['admin', 'user']), changePassword);

//查看所有用户
router.get('/', authorize(['admin']), getAllUsers);

// 分配虚拟机：仅 admin 可操作
router.post('/assign-vm/:vmid', authorize(['admin']), assignVMToUser);

// 取消分配虚拟机：仅 admin 可操作
router.post('/unassign/:vmid', authorize(['admin']), unassignVMFromUser);

//查看虚拟机绑定
router.get('/:username/vms', authorize(['admin', 'user']), getUserVMs);


// 心跳接口
router.post('/heartbeat', authorize(['user']),handleHeartbeat);


export default router;
