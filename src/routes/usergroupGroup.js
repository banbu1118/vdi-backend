import express from 'express';
import { auth, authorize } from '../middleware/auth.js';
import { addUserGroup, getUserGroups, updateUserGroup, deleteUserGroup, toggleUserGroupStatus } from '../controllers/usergroupController.js';
const router = express.Router();

router.use(auth);
//添加用户组
router.post('/addUserGroup', authorize(['admin']), addUserGroup);

// 获取所有用户组
router.get('/getUserGroups', authorize(['admin']), getUserGroups);

// 更新用户组
router.post('/updateUserGroup', authorize(['admin']), updateUserGroup);

//删除用户组
router.post('/deleteUserGroup', authorize(['admin']), deleteUserGroup);

//切换用户组状态（禁用/启用）
router.post('/toggleUserGroupStatus', authorize(['admin']), toggleUserGroupStatus);

export default router;