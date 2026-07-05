//判断用户是否为公网登录
export const isPublicLogin = (login_ip) => {
  // 检查 IP 是否为内网地址
  const isPrivateIP = (ip) => {
    const ipParts = ip.split('.').map(Number);
    
    // 10.0.0.0 – 10.255.255.255
    if (ipParts[0] === 10) {
      return true;
    }
    
    // 172.16.0.0 – 172.31.255.255
    if (ipParts[0] === 172 && ipParts[1] >= 16 && ipParts[1] <= 31) {
      return true;
    }
    
    // 192.168.0.0 – 192.168.255.255
    if (ipParts[0] === 192 && ipParts[1] === 168) {
      return true;
    }
    
    return false;
  };
  
  // 如果不是内网 IP，则是公网登录
  return !isPrivateIP(login_ip);
};