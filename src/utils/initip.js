// 判断// 获取网络模式并更新网络配置
import fs from 'fs';
import { execSync } from 'child_process';
import { getConfig } from '../utils/getConfig.js';

/**
 * 更新网络配置
 * 根据环境变量中的 IP_MODE、IP_ADDRESS、IP_NETMASK、IP_GATEWAY、IP_DNS 来设置网络配置
 */
export const updateip = () => {
  try {

    const ipMode = getConfig('IP_MODE');
    const ipAddress = getConfig('IP_ADDRESS');
    const ipNetmask = getConfig('IP_NETMASK');
    const ipGateway = getConfig('IP_GATEWAY');
    const ipDns = getConfig('IP_DNS');
        
    if (ipMode === 'static') {

      // 验证静态 IP 配置是否完整
      if (!ipAddress || !ipNetmask || !ipGateway || !ipDns) {
        console.error('❌ 静态 IP 配置不完整，请检查环境变量');
        return false;
      }
    }

    // 更新 /etc/network/interfaces
    //参数增加ipDns 用于resolvconf配置dns服务器
    const interfacesContent = generateInterfacesConfig(ipMode, ipAddress, ipNetmask, ipGateway,ipDns);
    writeFile('/etc/network/interfaces', interfacesContent);
    // console.log('✅ 已更新 /etc/network/interfaces');

    // 更新 /etc/resolv.conf
    // if (ipDns) {
    //   const resolvContent = generateResolvConfig(ipDns);
    //   writeFile('/etc/resolv.conf', resolvContent);
    //   // console.log('✅ 已更新 /etc/resolv.conf');
    // }

    // console.log('✅ 网络配置更新完成');

    //上面配置完网络 ，需要重启reboot重启宿主机生效
    execSync('reboot');

    return true;
  } catch (error) {
    console.error('❌ 更新网络配置失败:', error);
    console.error('Error stack:', error.stack);
    return false;
  }
};

/**
 * 生成 /etc/network/interfaces 配置内容
 * @param {string} mode - IP 模式 (dhcp 或 static)
 * @param {string} address - IP 地址
 * @param {string} netmask - 子网掩码
 * @param {string} gateway - 网关
 * @returns {string} 配置内容
 */
const generateInterfacesConfig = (mode, address, netmask, gateway,dns) => {
  let config = '# This file describes the network interfaces available on your system\n';
  config += '# and how to activate them. For more information, see interfaces(5).\n\n';
  config += 'source /etc/network/interfaces.d/*\n\n';
  config += '# The loopback network interface\n';
  config += 'auto lo\n';
  config += 'iface lo inet loopback\n\n';
  config += '# The primary network interface\n';
  config += 'allow-hotplug ens18\n';
  
  if (mode === 'dhcp') {
    config += 'iface ens18 inet dhcp\n';
  } else if (mode === 'static') {
    config += 'iface ens18 inet static\n';
    config += `address ${address}\n`;
    config += `netmask ${netmask}\n`;
    config += `gateway ${gateway}\n`;
    //用于resolvconf配置dns服务器
    config += `dns-nameservers ${dns}\n`;
  }
  
  return config;
};

/**
 * 生成 /etc/resolv.conf 配置内容
 * @param {string} dns - DNS 服务器地址
 * @returns {string} 配置内容
 */
// const generateResolvConfig = (dns) => {
//   return `nameserver ${dns}\n`;
// };

/**
 * 写入文件
 * @param {string} filePath - 文件路径
 * @param {string} content - 文件内容
 */
const writeFile = (filePath, content) => {
  try {
    fs.writeFileSync(filePath, content);
  } catch (error) {
    console.error(`❌ 写入文件 ${filePath} 失败:`, error);
    throw error;
  }
};

export default updateip
