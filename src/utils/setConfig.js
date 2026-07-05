import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES模块中获取当前文件路径的方法
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.resolve(__dirname, '../../config.json');

/**
 * 更新配置（每次只更新一个字段）
 * @param {string} key - 支持 a.b.c
 * @param {*} value - 要设置的值
 */
export const setConfig = (key, value) => {
  try {
    // 1️⃣ 读取最新配置
    const raw = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(raw);

    // 2️⃣ 拆分 key
    const keys = key.split('.');
    let obj = config;

    // 3️⃣ 找到最后一层
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];

      // 如果不存在，就创建对象
      if (!obj[k] || typeof obj[k] !== 'object') {
        obj[k] = {};
      }

      obj = obj[k];
    }

    // 4️⃣ 设置值
    obj[keys[keys.length - 1]] = value;

    // 5️⃣ 写回文件（格式化，方便你看）
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

    return true;
  } catch (err) {
    console.error('[config] 更新配置失败:', err.message);
    return false;
  }
};