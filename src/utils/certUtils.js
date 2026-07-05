// certUtils.js - 证书生成和管理工具
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * 生成自签名 SSL 证书
 * @param {string} ipAddress - 服务器 IP 地址（现在不使用，保持兼容）
 * @param {string} certDir - 证书目录
 * @returns {boolean} 是否生成成功
 */
export const generateCertificate = (ipAddress, certDir = './cert') => {
  try {
    // 确保证书目录存在
    if (!fs.existsSync(certDir)) {
      fs.mkdirSync(certDir, { recursive: true });
    }

    const certPath = path.join(certDir, 'server.crt');
    const keyPath = path.join(certDir, 'server.key');
    //
    // 生成自签名证书
    //
    execSync(`openssl req -x509 -nodes -days 3650 -newkey rsa:2048 -keyout '${keyPath}' -out '${certPath}' -subj '/C=CN/ST=Beng/O=Dev/OU=IT/CN=127.0.0.1' -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1'`, { stdio: 'ignore' });
    return true;
  } catch (error) {
    console.error('❌ 生成 SSL 证书失败:', error);
    return false;
  }
};

/**
 * 检查并更新证书
 * @param {string} newIP - 新的 IP 地址（现在不使用，保持兼容）
 * @returns {boolean} 是否更新成功
 */
export const checkAndUpdateCertificate = (newIP) => {
  try {
    const certDir = './cert';
    const certPath = path.join(certDir, 'server.crt');
    const keyPath = path.join(certDir, 'server.key');

    // 检查证书是否存在
    if (!fs.existsSync(certPath)) {
      console.log('📄 证书不存在，生成新证书...');
      const result = generateCertificate(newIP, certDir);
      if (!result) return false;
    } else {
      console.log('✅ 证书已经存在，使用现有的证书');
    }

    // 复制key和crt到/etc/rdpgw/
    console.log('🔧 复制证书到 /etc/rdpgw/...');
    execSync(`cp ${certPath} /etc/rdpgw/`);
    execSync(`cp ${keyPath} /etc/rdpgw/`);

    // 复制证书到系统证书目录
    console.log('🔧 复制证书到系统证书目录...');
    execSync(`cp ${certPath} /usr/local/share/ca-certificates/`);

    // 刷新系统证书
    console.log('🔧 刷新系统证书...');
    execSync(`update-ca-certificates`);

    console.log('✅ 证书配置完成');
    return true;
  } catch (error) {
    console.error('❌ 检查或更新证书失败:', error);
    // 失败时生成新证书
    return generateCertificate(newIP);
  }
};

// 导出默认函数
export default checkAndUpdateCertificate;