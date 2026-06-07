#!/bin/sh

set -e

echo "[0/8] Detect package system..."

USE_APK=0

if command -v apk >/dev/null 2>&1; then
    USE_APK=1
    echo "Detected APK system (OpenWrt 25.12+)"
else
    echo "Detected IPK system (OpenWrt 23.05 / 24.10)"
fi

echo "[1/8] Stop podkop-plus..."
/etc/init.d/podkop-plus stop 2>/dev/null || true

echo "[2/8] Configure podkop-plus..."
uci set podkop-plus.settings.dns_type='udp'
uci set podkop-plus.settings.dns_server='127.0.0.1:5354'
uci set podkop-plus.settings.dont_touch_dhcp='1'
uci commit podkop-plus

echo "[3/8] Update package lists..."

if [ "$USE_APK" -eq 1 ]; then
    apk update
else
    opkg update
fi

echo "[4/8] Download luci-app-dnsproxy..."

TMP_PKG="/tmp/luci-app-dnsproxy.pkg"

if [ "$USE_APK" -eq 1 ]; then
    PKG_URL="https://github.com/samara1531/luci-app-dnsproxy/releases/download/luci-dnsproxy-23/luci-app-dnsproxy_25.12_noarch.apk"
else
    PKG_URL="https://github.com/samara1531/luci-app-dnsproxy/releases/download/luci-dnsproxy-23/luci-app-dnsproxy_24.10_all.ipk"
fi

wget -O "$TMP_PKG" "$PKG_URL"

echo "[5/8] Install luci-app-dnsproxy..."

if [ "$USE_APK" -eq 1 ]; then
    apk add --allow-untrusted "$TMP_PKG"
else
    opkg install "$TMP_PKG"
fi

echo "[6/8] Write dnsproxy config..."

cat > /etc/config/dnsproxy <<'EOF'
config dnsproxy 'global'
	option refuse_any '1'
	option log_file '/dev/null'
	option all_servers '1'
	option enabled '1'
	option ipv6_disabled '1'
	option timeout '2s'
	option http3 '1'
	list listen_addr '127.0.0.1'
	list listen_port '5354'

config dnsproxy 'bogus_nxdomain'

config dnsproxy 'cache'
	option cache_optimistic '1'
	option size '65535'
	option min_ttl '60'
	option max_ttl '3600'
	option enabled '1'

config dnsproxy 'dns64'
	option dns64_prefix '64:ff9b::'

config dnsproxy 'edns'

config dnsproxy 'hosts'
	option enabled '0'
	list hosts_files ''

config dnsproxy 'private_rdns'
	option enabled '0'
	list upstream '127.0.0.1:53'

config dnsproxy 'servers'
	list bootstrap '77.88.8.8'
	list bootstrap '9.9.9.9'
	list upstream 'https://dns.quad9.net/dns-query'
	list upstream 'https://dns.google/dns-query'
	list upstream 'https://doh.opendns.com/dns-query'
	list upstream 'tls://dns.google'
	list upstream 'tls://dns.opendns.com'
	list fallback '77.88.8.8'
	list fallback '9.9.9.9'
	list fallback '10.0.0.1'

config dnsproxy 'tls'
	option enabled '0'
	option https_port '8443'
	option tls_port '853'
	option quic_port '853'
EOF

echo "[7/8] Configure dnsmasq..."

uci set dhcp.@dnsmasq[0].noresolv='1'
uci set dhcp.@dnsmasq[0].strictorder='1'
uci set dhcp.@dnsmasq[0].cachesize='0'

uci -q delete dhcp.@dnsmasq[0].server
uci add_list dhcp.@dnsmasq[0].server='127.0.0.42'
uci add_list dhcp.@dnsmasq[0].server='127.0.0.1#5354'

uci commit dhcp

/etc/init.d/dnsmasq restart

echo "[8/8] Restart services..."

# dnsproxy (if exists)
if [ -f /etc/init.d/dnsproxy ]; then
    /etc/init.d/dnsproxy enable 2>/dev/null || true
    /etc/init.d/dnsproxy restart 2>/dev/null || /etc/init.d/dnsproxy start
fi

/etc/init.d/podkop-plus start 2>/dev/null || true

echo "DONE ✔"
