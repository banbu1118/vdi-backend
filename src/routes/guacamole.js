import express from 'express';
import { auth } from '../middleware/auth.js';
import { generateGuacamoleToken } from '../utils/guacamole.js';
import { VM } from '../models/VM.js';
import { User } from '../models/User.js';


const router = express.Router();

router.post('/token', auth, async (req, res) => {
  try {

    const { vmid, width, height } = req.body;
    const { username } = req.user;

    if (!vmid) {
      return res.status(400).json({ code: 400, message: 'vmid 参数必填' });
    }

    const vm = await VM.findOne({ where: { vmid } });
    if (!vm) {
      return res.status(404).json({ code: 404, message: '虚拟机不存在' });
    }

    const user = await User.findOne({ where: { username } });
    if (!user) {
      return res.status(404).json({ code: 404, message: '用户不存在' });
    }

    const token = generateGuacamoleToken(user.toJSON(), vm.toJSON(), width, height);

    res.json({
      code: 0,
      message: 'success',
      data: { token }
    });
  } catch (error) {
    console.error('获取Guacamole Token失败:', error);
    res.status(500).json({ code: 500, message: '获取Token失败', error: error.message });
  }
});

export default router;