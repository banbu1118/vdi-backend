import express from 'express';
import { login } from '../controllers/authController.js';

const router = express.Router();

// 登录接口不需要 token
router.post('/login', login);

// 健康检查接口
router.get('/health', (req, res) => res.send('ok'));

export default router;
