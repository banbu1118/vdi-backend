#!/bin/sh
# Smart Alpine static IP setter (DHCP-free safe)

# --- 用户需要修改的部分 ---
IPADDR=#{address}
NETMASK=#{netmask}
GATEWAY=#{gateway}
DNS1=#{dns1}
DNS2=#{dns2}
# ------------------------

# 必须 root
if [ "$(id -u)" -ne 0 ]; then
    echo "Please run as root"
    exit 1
fi

# ========= 智能网卡识别（无 DHCP 也能用） =========

# 1️⃣ 尝试找 UP 状态的非 lo 网卡
IFACE=$(ip -o link show up | awk -F': ' '{print $2}' | grep -v '^lo$' | head -n1)

# 2️⃣ 如果还没找到，找有 carrier 的网卡
if [ -z "$IFACE" ]; then
    for i in /sys/class/net/*; do
        iface=$(basename "$i")
        [ "$iface" = "lo" ] && continue
        [ -f "$i/carrier" ] && [ "$(cat "$i/carrier")" = "1" ] && IFACE="$iface" && break
    done
fi

# 3️⃣ 兜底：第一个非 lo 网卡
if [ -z "$IFACE" ]; then
    IFACE=$(ls /sys/class/net | grep -v '^lo$' | head -n1)
fi

if [ -z "$IFACE" ]; then
    echo "No network interface found"
    exit 1
fi

echo "Detected interface: $IFACE"

# ================================================

# 备份现有配置
[ -f /etc/network/interfaces ] && cp /etc/network/interfaces /etc/network/interfaces.bak
[ -f /etc/resolv.conf ] && cp /etc/resolv.conf /etc/resolv.conf.bak

# ===== 清除可能的 DHCP 设置 =====
killall udhcpc 2>/dev/null || true

# ===== 配置静态 IP =====
ip addr flush dev "$IFACE"
ip addr add "$IPADDR/$NETMASK" dev "$IFACE"
ip link set "$IFACE" up
ip route add default via "$GATEWAY" dev "$IFACE"

# ===== DNS =====
cat > /etc/resolv.conf <<EOF
nameserver $DNS1
nameserver $DNS2
EOF
chmod 644 /etc/resolv.conf

# ===== 永久生效（Alpine 如果重启后保持） =====
# Alpine 使用 /etc/network/interfaces
cat > /etc/network/interfaces <<EOF
auto lo
iface lo inet loopback

auto $IFACE
iface $IFACE inet static
    address $IPADDR
    netmask $NETMASK
    gateway $GATEWAY
EOF

echo "Done."
echo "Interface: $IFACE"
echo "IP: $IPADDR"
echo "Gateway: $GATEWAY"
echo "DNS: $DNS1 $DNS2"
