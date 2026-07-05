import fs from 'fs';
import path from 'path';
import { User } from '../models/User.js';
import { VM } from '../models/VM.js';
import { getGatewayAccessToken } from './rdpgw-token.js';
import { getConfig } from './getConfig.js';

export const getVMRDP = async (req, res) => {

    try {

        // 重新加载环境变量，确保获取最新值
        const vmid = req.params.vmid;
        if (!vmid) {
            return res.status(400).json({ code: 400, message: 'vmid 必填' });
        }

        // 兼容 req.user 是字符串或对象的情况
        const username = typeof req.user === 'string' ? req.user : req.user?.username;
        if (!username) {
            return res.status(400).json({ code: 400, message: '未获取到用户名 (req.user)' });
        }

        // 查询用户策略配置
        const user = await User.findOne({
            where: { username },
            attributes: [
                'is_public_login',
                'direct',
                'public_gateway',
                'usb_redirect',
                'drive_redirect',
                'audio_redirect',
                'printer_redirect',
                'clipboard_redirect',
                'server_to_client_clipboard',
                'client_to_server_clipboard'
            ],
            raw: true
        });

        if (!user) {
            return res.status(404).json({ code: 404, message: '用户不存在' });
        }

        // 查询虚拟机信息
        const vm = await VM.findOne({
            where: { vmid },
            attributes: ['ip', 'rdp_port', 'vm_user', 'vm_password', 'status'],
            raw: true
        });

        if (!vm) {
            return res.status(404).json({ code: 404, message: '虚拟机不存在' });
        }

        const {
            ip = '',
            rdp_port = '',
            vm_user = '',
            vm_password = '',
            status = ''
        } = vm;

        if (status !== 'running' || !ip) {
            return res.status(409).json({ code: 409, message: '虚拟机未启动或网络异常，无法连接' });
        }

        // 判断要使用的网关配置
        let gatewayhostname = ''
        let gatewayusagemethod = ''
        let compression = ''
        let gatewayaccesstoken = ''
        let gatewaycredentialssource = ''

        //获取GW_HOST,GW_PORT和GW_PUBLIC_HOST,GW_PUBLIC_PORT,HOST_IP
        let GW_HOST = getConfig('GW_HOST')
        let GW_PORT = getConfig('GW_PORT')
        let GW_PUBLIC_HOST = getConfig('GW_PUBLIC_HOST')
        let GW_PUBLIC_PORT = getConfig('GW_PUBLIC_PORT')
        let HOST_IP = getConfig('HOST_IP')
        let RDP_GDI = getConfig('RDP_GDI')


        //GW_HOST或GW_PORT为空时，默认使用HOST_IP和HOST_PORT
        if (!GW_HOST || !GW_PORT) {
            GW_HOST = HOST_IP
            GW_PORT = 8443
        }
        if (!GW_PUBLIC_HOST || !GW_PUBLIC_PORT) {
            GW_PUBLIC_HOST = HOST_IP
            GW_PUBLIC_PORT = 9443
        }

        if (user.public_gateway == '1' && user.is_public_login == '1') {
            // 公网登录：使用数据库中 public_gateway 的值
            gatewayhostname = GW_PUBLIC_HOST + ':' + GW_PUBLIC_PORT
            gatewayusagemethod = '1'
            compression = '1'
            gatewaycredentialssource = '5'
            gatewayaccesstoken = await getGatewayAccessToken({
                rdpgwhost: GW_PUBLIC_HOST,
                rdpgwport: GW_PUBLIC_PORT,
                vmip: ip,
                vmport: rdp_port
            })
            
        } else {
            // 非公共登录
            if (user.direct == '1') {
                // 直连：不走网关
                gatewayhostname = ''
                gatewayusagemethod = '0'
                compression = '0'
                gatewaycredentialssource = ''

            } else {
                // 非直连：使用环境变量中的 GW
                gatewayhostname = GW_HOST + ':' + GW_PORT
                gatewayusagemethod = '1'
                compression = '1'
                gatewaycredentialssource = '5'
                gatewayaccesstoken = await getGatewayAccessToken({
                    rdpgwhost: GW_HOST,
                    rdpgwport: GW_PORT,
                    vmip: ip,
                    vmport: rdp_port
                })
            }
        }


        // 读取 RDP 模板
        const templatePath = path.join(process.cwd(), 'src', 'utils', 'templates', 'template.rdp');
        if (!fs.existsSync(templatePath)) {
            return res.status(500).json({ code: 500, message: 'RDP 模板文件不存在' });
        }

        let rdpTemplate = fs.readFileSync(templatePath, 'utf-8');

        // 替换内容
        rdpTemplate = rdpTemplate
            .replace(/^full address:s:.*$/m, `full address:s:${ip}`)
            .replace(/^server port:i:.*$/m, `server port:i:${rdp_port}`)
            .replace(/^username:s:.*$/m, `username:s:${vm_user}`)
            .replace(/^password:s:.*$/m, `password:s:${vm_password}`)
            .replace(/^redirectprinters:i:.*$/m, `redirectprinters:i:${user.printer_redirect === '1' ? 1 : 0}`)
            .replace(/^redirectcomports:i:.*$/m, `redirectcomports:i:0`)
            .replace(/^redirectsmartcards:i:.*$/m, `redirectsmartcards:i:0`)
            .replace(/^redirectclipboard:i:.*$/m, `redirectclipboard:i:${user.clipboard_redirect === '1' ? 1 : 0}`)
            .replace(/^drivestoredirect:s:.*$/m, `drivestoredirect:s:${user.drive_redirect === '1' ? '*' : ''}`)
            .replace(/^usbdevicestoredirect:s:.*$/m, `usbdevicestoredirect:s:${user.usb_redirect === '1' ? '*' : ''}`)
            .replace(/^audiomode:i:.*$/m, `audiomode:i:${user.audio_redirect === '0' ? 1 : 0}`)
            // 网关配置替换
            .replace(/^gatewayhostname:s:.*$/m, `gatewayhostname:s:${gatewayhostname}`)
            .replace(/^gatewayusagemethod:i:.*$/m, `gatewayusagemethod:i:${gatewayusagemethod}`)
            .replace(/^gatewayaccesstoken:s:.*$/m, `gatewayaccesstoken:s:${gatewayaccesstoken}`)
            .replace(/^gatewaycredentialssource:i:.*$/m, `gatewaycredentialssource:i:${gatewaycredentialssource}`)

            // 压缩配置
            .replace(/^compression:i:.*$/m, `compression:i:${compression}`)
            .replace(/^servertoclientclipboard:i:.*$/m, `servertoclientclipboard:i:${user.server_to_client_clipboard === '1' ? 1 : 0}`)
            .replace(/^clienttoserverclipboard:i:.*$/m, `clienttoserverclipboard:i:${user.client_to_server_clipboard === '1' ? 1 : 0}`)

            // 从环境变量中RDP_GDI加载gdi的配置
            .replace(/^GDI rendering:i:.*$/m, `gdi:i:${RDP_GDI}`)

        // 输出 RDP 文件
        res.setHeader('Content-Disposition', `attachment; filename=template.rdp`);
        res.setHeader('Content-Type', 'application/rdp; charset=utf-8');
        return res.send(rdpTemplate);

    } catch (err) {
        console.error('[VM] 生成 RDP 文件失败:', err);
        return res.status(500).json({ code: 500, message: '生成 RDP 文件失败', error: err.message });
    }
};