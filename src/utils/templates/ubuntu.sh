#!/bin/bash
# Universal Ubuntu static IP setter (Desktop & Server)

# --- 用户参数 ---
IPADDR=#{address}
NETMASK=#{netmask}
GATEWAY=#{gateway}
DNS1=#{dns1}
DNS2=#{dns2}
# -----------------

set -e

# ---------- Root 检查 ----------
[[ $EUID -ne 0 ]] && { echo "Please run as root"; exit 1; }

echo "[+] Ubuntu static IP setup started"

# ---------- 系统类型判断 ----------
if grep -iq "desktop" /etc/os-release; then
    SYSTEM_TYPE="desktop"
else
    SYSTEM_TYPE="server"
fi

echo "[+] Detected system type: $SYSTEM_TYPE"

# ---------- 自动检测主网卡 ----------
detect_iface() {
    IFACE=$(ip -o link show up | awk -F': ' '{print $2}' | grep -v '^lo$' | head -n1)
    [[ -z "$IFACE" ]] && IFACE=$(ls /sys/class/net | grep -v '^lo$' | head -n1)
    [[ -z "$IFACE" ]] && { echo "No network interface found"; exit 1; }
    echo "$IFACE"
}

IFACE=$(detect_iface)
echo "[+] Using interface: $IFACE"

# ---------- NETMASK → CIDR ----------
mask2cidr() {
    local n=0
    IFS=.
    for i in $1; do
        case $i in
            255) n=$((n+8));;
            254) n=$((n+7));;
            252) n=$((n+6));;
            248) n=$((n+5));;
            240) n=$((n+4));;
            224) n=$((n+3));;
            192) n=$((n+2));;
            128) n=$((n+1));;
            0);;
            *) echo "Invalid netmask: $1"; exit 1;;
        esac
    done
    echo "$n"
}

PREFIX=$(mask2cidr "$NETMASK")
echo "[+] Netmask $NETMASK -> /$PREFIX"

# ---------- Desktop: 使用 NetworkManager ----------
if [[ "$SYSTEM_TYPE" == "desktop" ]]; then
    echo "[+] Configuring static IP with NetworkManager"

    # 检查 nmcli 是否存在
    if ! command -v nmcli >/dev/null 2>&1; then
        echo "nmcli not found, installing NetworkManager..."
        apt update
        apt install -y network-manager
        systemctl enable NetworkManager
        systemctl start NetworkManager
    fi

    # 删除旧连接
    OLD_CONN=$(nmcli -t -f NAME,DEVICE connection show --active | awk -F: -v iface="$IFACE" '$2==iface{print $1}')
    for c in $OLD_CONN; do
        nmcli connection delete "$c" 2>/dev/null || true
    done

    # 添加静态 IP
    nmcli connection add type ethernet ifname "$IFACE" con-name "static-$IFACE" \
        ipv4.addresses "$IPADDR/$PREFIX" ipv4.gateway "$GATEWAY" \
        ipv4.dns "$DNS1 $DNS2" ipv4.method manual autoconnect yes

    nmcli connection up "static-$IFACE"

    echo "======================================"
    echo "Static IP applied using NetworkManager"
    echo "Interface : $IFACE"
    echo "IP        : $IPADDR/$PREFIX"
    echo "Gateway   : $GATEWAY"
    echo "DNS       : $DNS1 $DNS2"
    echo "======================================"

# ---------- Server: 使用 netplan + networkd ----------
else
    echo "[+] Configuring static IP with netplan + networkd"

    # 清理旧 netplan 配置
    mkdir -p /etc/netplan/backup
    mv /etc/netplan/*.yaml /etc/netplan/backup/ 2>/dev/null || true

    NETPLAN_FILE="/etc/netplan/01-static-ip.yaml"

    cat > "$NETPLAN_FILE" <<EOF
network:
  version: 2
  renderer: networkd
  ethernets:
    $IFACE:
      dhcp4: no
      addresses:
        - $IPADDR/$PREFIX
      routes:
        - to: default
          via: $GATEWAY
      nameservers:
        addresses:
          - $DNS1
          - $DNS2
EOF

    chmod 600 "$NETPLAN_FILE"

    # 停止可能冲突服务
    systemctl stop NetworkManager 2>/dev/null || true
    systemctl stop systemd-resolved 2>/dev/null || true

    # DNS 直接写 resolv.conf
    rm -f /etc/resolv.conf
    cat > /etc/resolv.conf <<EOF
nameserver $DNS1
nameserver $DNS2
EOF
    chmod 644 /etc/resolv.conf

    # 清理旧 IP
    ip addr flush dev "$IFACE"

    # 应用 netplan
    netplan generate
    netplan apply

    echo "======================================"
    echo "Static IP applied using netplan + networkd"
    echo "Interface : $IFACE"
    echo "IP        : $IPADDR/$PREFIX"
    echo "Gateway   : $GATEWAY"
    echo "DNS       : $DNS1 $DNS2"
    echo "======================================"
fi
