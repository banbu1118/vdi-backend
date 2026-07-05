import fs from 'fs';
import path from 'path';
import { getConfig } from './getConfig.js';

export const clearCert = async () => {
  try {
    const IP_MODE = getConfig('IP_MODE');
    if (IP_MODE === 'dhcp') {
      const keyPath = path.resolve('./cert/server.key');
      const certPath = path.resolve('./cert/server.crt');
      
      // 检查文件是否存在
      if (fs.existsSync(keyPath)) {
        fs.unlinkSync(keyPath);
      }
      
      if (fs.existsSync(certPath)) {
        fs.unlinkSync(certPath);
      }

      //删除/etc/rdpgw/server.key和/etc/rdpgw/server.crt
      if (fs.existsSync('/etc/rdpgw/server.key')) {
        fs.unlinkSync('/etc/rdpgw/server.key');
      }
      if (fs.existsSync('/etc/rdpgw/server.crt')) {
        fs.unlinkSync('/etc/rdpgw/server.crt');
      }

      //删除/usr/local/share/ca-certificates/server.crt
      if (fs.existsSync('/usr/local/share/ca-certificates/server.crt')) {
        fs.unlinkSync('/usr/local/share/ca-certificates/server.crt');
      }

      //更新系统证书
      execSync('update-ca-certificates');
      
      return true;
    }
    return false;
  } catch (error) {
    console.error('删除证书失败:', error);
    return false;
  }
}