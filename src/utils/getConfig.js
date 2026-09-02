import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { encryptSecret, decryptSecret, isEncrypted } from './crypto.js';

// ES模块中获取当前文件路径的方法
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.resolve(__dirname, '../../config.json');

// 需要加密落盘的敏感字段
const SENSITIVE_KEYS = ['PVE_PASSWORD', 'JWT_SECRET', 'OIDC_ADMIN_PASSWORD', 'OIDC_CLIENT_SECRET', 'guacamole_SECRET'];

let permissionChecked = false;

/**
 * 获取配置值（每次都会重新读取文件）
 * @param {string} key - 支持 a.b.c
 * @param {*} defaultValue - 默认值
 */
export const getConfig = (key, defaultValue = undefined) => {
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(raw);

    // 一次性收紧 config.json 文件权限
    if (!permissionChecked) {
      try {
        fs.chmodSync(configPath, 0o600);
        permissionChecked = true;
      } catch (e) {
        // 权限收紧失败不阻塞读取
      }
    }

    // 迁移：将未加密的敏感字段自动加密回写（密文已存在则跳过）
    for (const k of SENSITIVE_KEYS) {
      const v = config[k];
      if (typeof v === 'string' && v !== '' && !isEncrypted(v)) {
        config[k] = encryptSecret(v);
        try {
          fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
        } catch (e) {
          console.error('[config] 敏感字段加密回写失败:', e.message);
        }
      }
    }

    // 不传 key 返回整个配置（敏感字段解密后返回）
    if (!key) {
      for (const k of SENSITIVE_KEYS) {
        if (typeof config[k] === 'string') config[k] = decryptSecret(config[k]);
      }
      return config;
    }

    const keys = key.split('.');
    let result = config;

    for (const k of keys) {
      if (result && Object.prototype.hasOwnProperty.call(result, k)) {
        result = result[k];
      } else {
        return defaultValue;
      }
    }

    // 敏感字段读取时解密
    if (SENSITIVE_KEYS.includes(key)) {
      result = decryptSecret(result);
    }

    return result;
  } catch (err) {
    console.error('[config] 读取配置失败:', err.message);
    return defaultValue;
  }
};