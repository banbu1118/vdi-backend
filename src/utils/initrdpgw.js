// 初始化inrdpgw服务
import fs from 'fs';
import { execSync } from 'child_process';
import { getConfig } from './getConfig.js';
import {getSystemIP} from './networkUtils.js';

/**
 * 更新 inrdpgw.yaml 文件中的 GatewayAddress 和 ClientSecret
 * @returns {boolean} 是否更新成功
 */
export const initRdpgwConfig = () => {
  try {

    let GW_HOST = getConfig('GW_HOST');
    let GW_PORT = getConfig('GW_PORT');
    let GW_PUBLIC_HOST = getConfig('GW_PUBLIC_HOST');
    let GW_PUBLIC_PORT = getConfig('GW_PUBLIC_PORT');
    const IP_MODE = getConfig('IP_MODE');
    const HOST_IP = getConfig('HOST_IP');
    const OIDC_CLIENT_SECRET = getConfig('OIDC_CLIENT_SECRET');

    //如果GW_HOST为空或IP_MODE为dhcp，则使用HOST_IP
    if (!GW_HOST||IP_MODE === 'dhcp') {
      GW_HOST = HOST_IP;
      GW_PORT = 8443;
    }
    
    //如果GW_PUBLIC_HOST为空或IP_MODE为dhcp，则使用HOST_IP
    if (!GW_PUBLIC_HOST||IP_MODE === 'dhcp') {
      GW_PUBLIC_HOST = HOST_IP;
      GW_PUBLIC_PORT = 9443;
    }

    const GW_URL = `https://${GW_HOST}:${GW_PORT}`;
    const PUBLIC_GW_URL = `https://${GW_PUBLIC_HOST}:${GW_PUBLIC_PORT}`;


    const configPath_inrdpgw = '/etc/rdpgw/inrdpgw.yaml';
    const configPath_outrdpgw = '/etc/rdpgw/outrdpgw.yaml';
    
    // 检查文件是否存在
    if (!fs.existsSync(configPath_inrdpgw)) {
      console.error('❌ rdpgw.yaml 文件不存在:', configPath_inrdpgw);
      return false;
    }
    if (!fs.existsSync(configPath_outrdpgw)) {
      console.error('❌ outrdpgw.yaml 文件不存在:', configPath_outrdpgw);
      return false;
    }
    
    // 读取配置文件内容
    const configContent_inrdpgw = fs.readFileSync(configPath_inrdpgw, 'utf8');
    const configContent_outrdpgw = fs.readFileSync(configPath_outrdpgw, 'utf8');
    
    // inrdpgw 使用正则表达式替换 GatewayAddress
    let updatedContent_inrdpgw = configContent_inrdpgw.replace(
      /GatewayAddress:\s*https?:\/\/[^\s]+/g,
      `GatewayAddress: ${GW_URL}`
    );

    // outrdpgw 使用正则表达式替换 GatewayAddress
    let updatedContent_outrdpgw = configContent_outrdpgw.replace(
      /GatewayAddress:\s*https?:\/\/[^\s]+/g,
      `GatewayAddress: ${PUBLIC_GW_URL}`
    );
    
    
    // 替换 ClientSecret（更健壮的正则表达式，匹配到行尾）
    updatedContent_inrdpgw = updatedContent_inrdpgw.replace(
      /ClientSecret:\s*.*/g,
      `ClientSecret: ${OIDC_CLIENT_SECRET}`
    );

    // outrdpgw 替换 ClientSecret
    updatedContent_outrdpgw = updatedContent_outrdpgw.replace(
      /ClientSecret:\s*.*/g,
      `ClientSecret: ${OIDC_CLIENT_SECRET}`
    );
    
    // 写回文件
    fs.writeFileSync(configPath_inrdpgw, updatedContent_inrdpgw);
    fs.writeFileSync(configPath_outrdpgw, updatedContent_outrdpgw);
    
    // 重启服务
    execSync('systemctl restart inrdpgw.service');
    execSync('systemctl restart outrdpgw.service');
    
    return true;
  } catch (error) {
    console.error('❌ 更新 inrdpgw.yaml 失败:', error);
    console.error('Error stack:', error.stack);
    return false;
  }
};

// 导出默认函数
export default initRdpgwConfig;