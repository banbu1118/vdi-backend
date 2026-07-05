import crypto from 'crypto';

/**
 * 生成安全随机密码
 * @param {number} length 密码长度，默认 16
 * @returns {string} 随机密码
 */
export const generateSecurePassword = (length = 16) => {
  const sets = {
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    lower: 'abcdefghijklmnopqrstuvwxyz',
    digits: '0123456789',
    symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?'
  };

  // 确保每种类型至少一个字符
  let passwordChars = Object.values(sets).map(set => set[Math.floor(Math.random() * set.length)]);

  // 剩余长度随机填充
  const allChars = Object.values(sets).join('');
  const remainingLength = length - passwordChars.length;
  const randomBytes = crypto.randomBytes(remainingLength);

  for (let i = 0; i < remainingLength; i++) {
    passwordChars.push(allChars[randomBytes[i] % allChars.length]);
  }

  // 打乱顺序
  for (let i = passwordChars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [passwordChars[i], passwordChars[j]] = [passwordChars[j], passwordChars[i]];
  }

  return passwordChars.join('');
};
