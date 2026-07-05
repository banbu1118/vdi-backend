export function getClientIp(req) {
  let ip =
    req.headers['x-forwarded-for'] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.ip ||
    '';

  // 如果是多个代理IP，用第一个
  if (ip.includes(',')) ip = ip.split(',')[0].trim();

  // 去掉 IPv6 映射前缀 ::ffff:
  if (ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');

  // 去掉可能的方括号 [::1]
  ip = ip.replace(/[\[\]]/g, '');

  return ip;
}
