import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES模块中获取当前文件路径的方法
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.resolve(__dirname, '../../config.json');

/**
 * 获取配置值（每次都会重新读取文件）
 * @param {string} key - 支持 a.b.c
 * @param {*} defaultValue - 默认值
 */
export const getConfig = (key, defaultValue = undefined) => {
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(raw);

    // 不传 key 返回整个配置
    if (!key) return config;

    const keys = key.split('.');
    let result = config;

    for (const k of keys) {
      if (result && Object.prototype.hasOwnProperty.call(result, k)) {
        result = result[k];
      } else {
        return defaultValue;
      }
    }

    return result;
  } catch (err) {
    console.error('[config] 读取配置失败:', err.message);
    return defaultValue;
  }
};