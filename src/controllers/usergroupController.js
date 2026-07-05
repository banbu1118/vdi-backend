import { UserGroup } from '../models/UserGroup.js';
import { assignVm } from '../utils/assignVm.js';
import {User} from '../models/User.js';


//添加用户组
export const addUserGroup = async (req, res) => {
    try {
        const { user_group, description, bind_vm_group } = req.body;

        // 输入验证
        if (!user_group || typeof user_group !== 'string' || user_group.trim() === '') {
            return res.status(400).json({
                code: 400,
                message: '用户组名称不能为空'
            });
        }

        // 验证 bind_vm_group 类型，可以是一个空数组
        if (bind_vm_group && !Array.isArray(bind_vm_group)) {
            return res.status(400).json({
                code: 400,
                message: 'bind_vm_group 必须是一个数组'
            });
        }

        // 检查数据库用户组是否已存在
        const existingGroup = await UserGroup.findOne({
            where: {
                user_group: user_group.trim()
            }
        });

        if (existingGroup) {
            return res.status(400).json({
                code: 400,
                message: '用户组已存在，禁止创建重复的用户组'
            });
        }

        // 数据库创建用户组
        await UserGroup.create({
            user_group: user_group.trim(),
            description: description || '',
            bind_vm_group: bind_vm_group || []
        });

        return res.json({
            code: 0,
            message: '添加成功'
        });

    } catch (error) {
        console.error('添加用户组失败:', error);
        return res.status(500).json({
            code: 500,
            message: '添加用户组失败',
            error: error.message
        });
    }
};

//查看所有用户组
export const getUserGroups = async (req, res) => {
    try {
        const userGroups = await UserGroup.findAll();
        return res.json({
            code: 0,
            message: '获取成功',
            data: userGroups
        });
    } catch (error) {
        console.error('获取用户组失败:', error);
        return res.status(500).json({
            code: 500,
            message: '获取用户组失败',
            error: error.message
        });
    }
};

//更新用户组
export const updateUserGroup = async (req, res) => {
    const { user_group, description, bind_vm_group } = req.body;

    try {
        // 验证 bind_vm_group 类型，允许是一个空数组
        if (bind_vm_group && !Array.isArray(bind_vm_group)) {
            return res.status(400).json({
                code: 400,
                message: 'bind_vm_group 必须是一个数组'
            });
        }

        // 检查用户组是否存在
        const existingGroup = await UserGroup.findOne({
            where: {
                user_group: user_group.trim()
            }
        });

        if (!existingGroup) {
            return res.status(404).json({
                code: 404,
                message: '用户组不存在'
            });
        }

        //从数据库中查询这个用户组的bind_vm_group有哪些，只返回bind_vm_group字段的值
        const existingGroupData = await UserGroup.findOne({
            attributes: ['bind_vm_group'],
            where: {
                user_group: user_group.trim()
            }
        });

        // 确保 existingBindVMGroups 是一个数组
        const existingBindVMGroups = existingGroupData && existingGroupData.bind_vm_group ? existingGroupData.bind_vm_group : [];

        // existingBindVMGroups数组和bind_vm_group数组进行比较，找出差异并设置flag
        const diffGroups = [];

        // 处理新增的虚拟机组（在bind_vm_group中但不在existingBindVMGroups中）
        bind_vm_group.forEach(group => {
            if (!existingBindVMGroups.includes(group)) {
                diffGroups.push({ bind_vm_group: group, flag: '1' });
            }
        });

        // 处理删除的虚拟机组（在existingBindVMGroups中但不在bind_vm_group中）
        existingBindVMGroups.forEach(group => {
            if (!bind_vm_group.includes(group)) {
                diffGroups.push({ bind_vm_group: group, flag: '0' });
            }
        });

        console.log('有差异的数据:', diffGroups);

        console.log('开始分配虚拟机组给用户组');

        //检测虚拟机组数组不为空数组，则通过执行assignVm分配虚拟机组给用户组
        await assignVm({
            user_group: user_group.trim(),
            diffGroups: diffGroups
        });

        console.log('完成分配虚拟机组给用户组');


        // 更新用户组
        await existingGroup.update({
            description: description || '',
            bind_vm_group: bind_vm_group || []
        });

        return res.json({
            code: 0,
            message: '更新成功'
        });
    } catch (error) {
        console.error('更新用户组失败:', error);
        return res.status(500).json({
            code: 500,
            message: '更新用户组失败',
            error: error.message
        });
    }

};

//删除用户组
export const deleteUserGroup = async (req, res) => {
    const { user_group } = req.body;
    try {
        if (!user_group) {
            return res.status(400).json({
                code: 400,
                message: '用户组名称不能为空'
            });
        }

        // 检查用户组是否存在
        const existingGroup = await UserGroup.findOne({
            where: {
                user_group: user_group.trim()
            }
        });

        if (!existingGroup) {
            return res.status(404).json({
                code: 404,
                message: '用户组不存在'
            });
        }

        //从User表中找到group字段为user_group的用户，把disabled字段设置为字符串1并把group字段设置为空字符串，保存到数据库
        const users = await User.findAll({
            where: {
                group: user_group
            }
        });
        users.forEach(user => {
            user.disabled = '1';
            user.group = '';
            user.save();
        });

        // 删除用户组
        await existingGroup.destroy();

        return res.json({
            code: 0,
            message: '删除成功'
        });
    } catch (error) {
        console.error('删除用户组失败:', error);
        return res.status(500).json({
            code: 500,
            message: '删除用户组失败',
            error: error.message
        });
    }
};

//切换用户组状态（禁用/启用）
export const toggleUserGroupStatus = async (req, res) => {
    const { user_group, disabled } = req.body;
    try {
        // 检查用户组是否存在
        const existingGroup = await UserGroup.findOne({
            where: {
                user_group: user_group.trim()
            }
        });

        if (!existingGroup) {
            return res.status(404).json({
                code: 404,
                message: '用户组不存在'
            });
        }

        let newStatus = ""
        // 切换状态，disabled字段是字符串，0表示启用，1表示禁用，如果当前状态是0，切换为1，如果当前状态是1，切换为0
        if (disabled === '0') {
            newStatus = '1';
            //从User表中找到字段group为user_group的用户，将disabled字段设置为1
            const users = await User.findAll({
                where: {
                    group: user_group
                }
            });
            users.forEach(user => {
                user.disabled = '1';
                user.save();
            });
        }

        if (disabled === '1') {
            newStatus = '0';
            //从User表中找到字段group为user_group的用户，将disabled字段设置为0
            const users = await User.findAll({
                where: {
                    group: user_group
                }
            });
            users.forEach(user => {
                user.disabled = '0';
                user.save();
            });
        }
        // const newStatus = disabled === '0' ? '1' : '0';
        await existingGroup.update({
            disabled: newStatus
        });

        return res.json({
            code: 0,
            message: `用户组 ${user_group} 已${newStatus === '0' ? '启用' : '禁用'}`
        });
    } catch (error) {
        console.error('切换用户组状态失败:', error);
        return res.status(500).json({
            code: 500,
            message: '切换用户组状态失败',
            error: error.message
        });
    }
};

