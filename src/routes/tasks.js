import express from 'express';
import { getAllCountsController,getTemplateController,getVMListController} from '../controllers/taskController.js';
import { auth, authorize } from '../middleware/auth.js';
import {createTaskController,updateTaskController,getTasksController,getTaskController} from '../controllers/taskController.js';

const router = express.Router();
router.use(auth);

// 获取虚拟机、模板、虚拟机组、用户、用户组数量
router.get('/', authorize(['admin']), getAllCountsController);

//获取模板列表
router.get('/templates', authorize(['admin']), getTemplateController);

//获取虚拟机列表

router.get('/vms', authorize(['admin']), getVMListController);

//创建任务
router.post('/createtask', authorize(['admin', 'user']), createTaskController);

//更新任务
router.post('/updatetask', authorize(['admin', 'user']), updateTaskController);

//获取任务列表
router.get('/tasks', authorize(['admin', 'user']), getTasksController);

//获取任务详情
router.get('/task/:id', authorize(['admin', 'user']), getTaskController);

export default router;
