// src/utils/crypto.js
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

// ES模块中获取当前文件路径的方法
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加密密钥文件（与 config.json 同级，位于项目根目录的 .keys 下）
const keyPath = path.resolve(__dirname, '../../.keys/master.key');

const ALGORITHM = 'aes-256-gcm';
const ENC_PREFIX = 'enc:';
const IV_LENGTH = 12;   // GCM 推荐 96-bit IV
const TAG_LENGTH = 16;  // GCM auth tag 长度

/**
 * 获取（或首次生成）加密密钥，并限制文件权限为 600
 */
function getMasterKey() {
  if (fs.existsSync(keyPath)) {
    const key = fs.readFileSync(keyPath, 'utf8').trim();
    if (key) return Buffer.from(key, 'base64');
  }

  // 首次运行：生成随机 32 字节密钥
  const key = crypto.randomBytes(32).toString('base64');
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  fs.writeFileSync(keyPath, key, { mode: 0o600 });
  console.log('[crypto] 已生成配置加密密钥:', keyPath);
  return Buffer.from(key, 'base64');
}

/**
 * 加密明文，返回 enc: 前缀的密文；空值原样返回
 */
export function encryptSecret(plaintext) {
  if (plaintext == null || plaintext === '') return plaintext;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getMasterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return ENC_PREFIX + Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

/**
 * 解密 enc: 前缀的密文；非密文原样返回；解密失败返回空串并打印错误
 */
export function decryptSecret(value) {
  if (typeof value !== 'string' || !value.startsWith(ENC_PREFIX)) return value;
  try {
    const buf = Buffer.from(value.slice(ENC_PREFIX.length), 'base64');
    const iv = buf.subarray(0, IV_LENGTH);
    const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, getMasterKey(), iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch (err) {
    console.error('[crypto] 敏感配置解密失败:', err.message);
    return '';
  }
}

/**
 * 判断值是否为已加密的密文
 */
export const isEncrypted = (value) =>
  typeof value === 'string' && value.startsWith(ENC_PREFIX);
