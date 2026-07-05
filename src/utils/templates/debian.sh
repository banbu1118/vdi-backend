#!/bin/bash
# Smart Debian static IP setter (DHCP-free safe)

# --- 用户需要修改的部分 ---
IPADDR=#{address}
NETMASK=#{netmask}
GATEWAY=#{gateway}
DNS1=#{dns1}
DNS2=#{dns2}
# ------------------------

# 必须 root
if [[ $EUID -ne 0 ]]; then
   echo "Please run as root"
   exit 1
fi

# ========= 智能网卡识别（无 DHCP 也能用） =========

# 1️⃣ 尝试找 UP 状态的非 lo 网卡
IFACE=$(ip -o link show up | awk -F': ' '{print $2}' | grep -v '^lo$' | head -n1)

# 2️⃣ 如果还没找到，找有 carrier 的网卡
if [[ -z "$IFACE" ]]; then
    IFACE=$(for i in /sys/class/net/*; do
        iface=$(basename "$i")
        [[ "$iface" == "lo" ]] && continue
        [[ -f "$i/carrier" && "$(cat "$i/carrier")" == "1" ]] && echo "$iface" && break
    done)
fi

# 3️⃣ 兜底：第一个非 lo 网卡
if [[ -z "$IFACE" ]]; then
    IFACE=$(ls /sys/class/net | grep -v '^lo$' | head -n1)
fi

if [[ -z "$IFACE" ]]; then
    echo "No network interface found"
    exit 1
fi

echo "Detected interface: $IFACE"

# ================================================

# 备份配置
cp /etc/network/interfaces /etc/network/interfaces.bak 2>/dev/null
cp /etc/resolv.conf /etc/resolv.conf.bak 2>/dev/null

# 写入静态 IP（不依赖 DHCP）
cat > /etc/network/interfaces <<EOF
# This file is managed by smart-set-static-ip.sh
auto lo
iface lo inet loopback

auto $IFACE
iface $IFACE inet static
    address $IPADDR
    netmask $NETMASK
    gateway $GATEWAY
EOF

# ===== DNS：直接接管 resolv.conf =====

# 停止 dhcpcd（如果存在）
if systemctl list-unit-files | grep -q '^dhcpcd.service'; then
    systemctl stop dhcpcd 2>/dev/null
    systemctl disable dhcpcd 2>/dev/null
fi

rm -f /etc/resolv.conf

cat > /etc/resolv.conf <<EOF
nameserver $DNS1
nameserver $DNS2
EOF

chmod 644 /etc/resolv.conf

# ===================================

# 重启网络
if systemctl is-enabled --quiet networking 2>/dev/null; then
    systemctl restart networking
else
    /etc/init.d/networking restart
fi

echo "Done."
echo "Interface: $IFACE"
echo "IP: $IPADDR"
echo "Gateway: $GATEWAY"
echo "DNS: $DNS1 $DNS2"
