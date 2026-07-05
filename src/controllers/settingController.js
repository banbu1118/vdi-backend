import { User } from '../models/User.js';
import { updateip } from '../utils/initip.js';
import { execSync } from 'child_process';
import { getConfig } from '../utils/getConfig.js';
import { setConfig } from '../utils/setConfig.js';
import fs from 'fs';
import path from 'path';



//获取pve连接配置
export const getPveConfig = async (req, res) => {
    try {

        const pveHost = getConfig('PVE_HOST') || '';
        const pvePort = getConfig('PVE_PORT') || '';
        const pveUser = getConfig('PVE_USER') || '';

        //返回pve连接配置
        res.status(200).json({ message: "获取成功", data: { host: pveHost, port: pvePort, user: pveUser } });

    } catch (err) {
        console.error("获取PVE连接配置失败:", err);
        res.status(500).json({ message: "获取PVE连接配置失败" });
    }
}

//更新配置pve连接
export const configPve = async (req, res) => {
    const { host, port, user, password } = req.body;
    try {

        // 更新环境变量
        setConfig('PVE_HOST', host);
        setConfig('PVE_PORT', port);
        setConfig('PVE_USER', user);
        setConfig('PVE_PASSWORD', password);

        // 返回更新后的pve连接配置
        res.json({ code: 200, message: '配置成功' });

        //重启系统
        execSync('reboot');


    } catch (err) {
        console.error("更新PVE连接配置失败:", err);
        res.status(500).json({ message: "更新PVE连接配置失败" });
    }
}

//获取网络模式
// 支持 dhcp 和 static 模式
//如果是static模式，需要提供ip地址、子网掩码、网关、dns服务器，从.env件中读取
//如果是static模式，就返回ip地址、子网掩码、网关、dns服务器
export const getNetworkConfig = async (req, res) => {
    try {
        const ipMode = getConfig('IP_MODE') || 'dhcp';
        const ipAddress = getConfig('IP_ADDRESS') || '';
        const ipNetmask = getConfig('IP_NETMASK') || '';
        const ipGateway = getConfig('IP_GATEWAY') || '';
        const ipDns = getConfig('IP_DNS') || '';

        //如果是static模式，返回ip地址、子网掩码、网关、dns服务器
        if (ipMode === 'static') {
            //返回网络配置
            res.status(200).json({ message: "获取成功", data: { ip_mode: ipMode, ip_address: ipAddress, ip_netmask: ipNetmask, ip_gateway: ipGateway, ip_dns: ipDns } });
        } else {
            //返回网络配置
            res.status(200).json({ message: "获取成功", data: { ip_mode: ipMode } });
        }


    } catch (err) {
        console.error("获取网络配置失败:", err);
        res.status(500).json({ message: "获取网络配置失败" });
    }
}

//更新网络模式
// 支持 dhcp 和 static 模式
//如果是static模式，需要提供ip地址、子网掩码、网关、dns服务器
// 更新.env文件中的IP_MODE变量
export const updateNetworkConfig = async (req, res) => {
    const { ip_mode, address, netmask, gateway, dns } = req.body;
    try {
        // 验证 ip_mode 参数
        if (!ip_mode || !['dhcp', 'static'].includes(ip_mode)) {
            return res.status(400).json({ message: 'ip_mode 参数必须是 dhcp 或 static' });
        }

        // 如果是 static 模式，验证必要的网络参数
        if (ip_mode === 'static') {
            if (!address || !netmask || !gateway || !dns) {
                return res.status(400).json({ message: 'static 模式需要提供 address、netmask、gateway 和 dns 参数' });
            }
        }

        setConfig('IP_MODE', ip_mode);

        if (ip_mode === 'static') {
            setConfig('IP_ADDRESS', address);
            setConfig('IP_NETMASK', netmask);
            setConfig('IP_GATEWAY', gateway);
            setConfig('IP_DNS', dns);
        }

        // 返回更新后的网络配置
        res.json({
            code: 200,
            message: '配置成功'
        });

        //修改宿主机网络，并重启服务
        updateip();

    } catch (err) {
        console.error("更新网络配置失败:", err);
        res.status(500).json({ message: "更新网络配置失败" });
    }
}



//获取公网网关代理
export const getPublicGatewayProxy = async (req, res) => {
    try {
        const gwPublicHost = getConfig('GW_PUBLIC_HOST') || '';
        const gwPublicPort = getConfig('GW_PUBLIC_PORT') || '';
        //返回网关配置
        res.json({
            code: 200,
            message: '获取成功',
            data: {
                gwPublicHost,
                gwPublicPort
            }
        });
    } catch (err) {
        console.error("获取网关配置失败:", err);
        res.status(500).json({ message: "获取网关配置失败" });
    }
}

//更新公网网关代理
export const updatePublicGatewayProxy = async (req, res) => {
    try {
        //从请求体获取网关配置
        const { gwPublicHost, gwPublicPort } = req.body;

        setConfig('GW_PUBLIC_HOST', gwPublicHost);
        setConfig('GW_PUBLIC_PORT', gwPublicPort);

        // 返回网关配置
        res.json({
            code: 200,
            message: '更新成功'
        });

        //上面配置完网络 ，需要重启reboot重启宿主机生效
        execSync('reboot');
    } catch (err) {
        console.error("更新网关配置失败:", err);
        res.status(500).json({ message: "更新网关配置失败" });
    }
}


//获取内网网关代理
export const getGatewayProxy = async (req, res) => {
    try {
        const gwHost = getConfig('GW_HOST') || '';
        const gwPort = getConfig('GW_PORT') || '';

        //返回网关配置
        res.json({
            code: 200,
            message: '获取成功',
            data: {
                gwHost,
                gwPort
            }
        });
    } catch (err) {
        console.error("获取网关配置失败:", err);
        res.status(500).json({ message: "获取网关配置失败" });
    }
}

//更新内网网关代理
export const updateGatewayProxy = async (req, res) => {
    try {
        //从请求体获取网关配置
        const { gwHost, gwPort } = req.body;

        setConfig('GW_HOST', gwHost);
        setConfig('GW_PORT', gwPort);

        // 返回网关配置
        res.json({
            code: 200,
            message: '更新成功',
            data: {
                gwHost,
                gwPort
            }
        });

        //上面配置完网络 ，需要重启reboot重启宿主机生效
        execSync('reboot');

    } catch (err) {
        console.error("更新内网网关配置失败:", err);
        res.status(500).json({ message: "更新内网网关配置失败" });
    }
}


//获取freerdp配置
export const getRdpConfig = async (req, res) => {
    try {
        const rdpCoder = getConfig('RDP_CODER') || '';
        const rdpGdi = getConfig('RDP_GDI') || '';

        //返回freerdp配置
        res.json({
            code: 200,
            message: '获取成功',
            data: {
                rdpCoder,
                rdpGdi
            }
        });
    } catch (err) {
        console.error("获取freerdp配置失败:", err);
        res.status(500).json({ message: "获取freerdp配置失败" });
    }
}



//更新freerdp配置
export const updateRdpConfig = async (req, res) => {
    try {
        //从请求体获取freerdp配置
        const { rdpCoder, rdpGdi } = req.body;
        setConfig('RDP_CODER', rdpCoder);
        setConfig('RDP_GDI', rdpGdi);
        
        // 返回freerdp配置
        res.json({
            code: 200,
            message: '更新成功'
        });
    } catch (err) {
        console.error("更新freerdp配置失败:", err);
        res.status(500).json({ message: "更新freerdp配置失败" });
    }
}



//修改管理员密码
//用户需要输入旧密码和新密码，如果旧密码正确，就更新为新密码
export const updateAdminPassword = async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    try {
        // 验证参数
        if (!oldPassword || !newPassword) {
            return res.status(400).json({ message: '旧密码和新密码不能为空' });
        }

        // 找到管理员用户
        const adminUser = await User.findOne({ where: { role: 'admin' } });
        if (!adminUser) {
            return res.status(404).json({ message: '管理员用户不存在' });
        }

        // 验证旧密码
        const bcrypt = await import('bcrypt');
        const isValid = await bcrypt.compare(oldPassword, adminUser.password);
        if (!isValid) {
            return res.status(400).json({ message: '旧密码错误' });
        }

        // 哈希新密码
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

        // 更新管理员密码
        await adminUser.update({
            password: hashedPassword
        });

        // 返回结果
        res.json({
            code: 200,
            message: '密码更新成功'
        });
    } catch (err) {
        console.error("更新管理员密码失败:", err);
        res.status(500).json({ message: "更新管理员密码失败" });
    }
}


//获取产品版本信息
export const getProductVersion = async (req, res) => {
    try {
        const packageJsonPath = path.resolve(process.cwd(), 'package.json');
        const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');
        const packageJson = JSON.parse(packageJsonContent);
        const version = packageJson.version;
        const license = packageJson.license;
        const product = 'OpenDesk'
        res.json({
            code: 200,
            message: '获取成功',
            data: {
                version,
                license,
                product
            }
        });
    } catch (err) {
        console.error("获取产品版本信息失败:", err);
        res.status(500).json({ message: "获取产品版本信息失败" });
    }
}
