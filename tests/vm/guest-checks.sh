#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# Checks run INSIDE a Zovelis OS virtual machine (as root, through the QEMU
# guest agent):   vmctl.py exec --name NAME --stdin -- /bin/sh -s live < guest-checks.sh
#
# First argument: "live" (booted from the ISO) or "installed".
# Prints one "ok:" / "FAIL:" / "info:" line per check; exits non-zero if any
# check failed. Each check maps to a requirement of the project brief.
set -u
mode=${1:-installed}
export LC_ALL=C.UTF-8 PATH=/usr/sbin:/usr/bin:/sbin:/bin

failures=0
ok() { echo "ok:   $*"; }
fail() { echo "FAIL: $*"; failures=$((failures + 1)); }
info() { echo "info: $*"; }
check() {
    description=$1
    shift
    if "$@" >/dev/null 2>&1; then ok "$description"; else fail "$description"; fi
}
installed() { [ "$(dpkg-query -W -f '${db:Status-Status}' "$1" 2>/dev/null)" = installed ]; }

echo "== Zovelis OS guest checks ($mode)"

# --- Identity --------------------------------------------------------------
check "os-release: Zovelis OS" grep -qx 'ID=zovelis' /etc/os-release
info "$(grep '^PRETTY_NAME=' /etc/os-release)"
info "kernel $(uname -r), $(nproc) CPU(s), $(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo) MiB RAM"

# --- System health ---------------------------------------------------------
state=$(systemctl is-system-running 2>/dev/null)
case "$state" in
    running) ok "all services started (systemctl: running)" ;;
    *)
        fail "system state is '$state'"
        systemctl --failed --no-legend --plain | sed 's/^/      failed unit: /'
        ;;
esac

# --- Desktop -----------------------------------------------------------------
# The user's desktop session (not the login screen's own "greeter" session).
session=""
for id in $(loginctl list-sessions --no-legend 2>/dev/null | awk '{print $1}'); do
    if [ "$(loginctl show-session "$id" -p Class --value)" = user ] &&
        [ "$(loginctl show-session "$id" -p Seat --value)" = seat0 ]; then
        case $(loginctl show-session "$id" -p Type --value) in
            wayland | x11) session=$id; break ;;
        esac
    fi
done
if [ -n "$session" ]; then
    type=$(loginctl show-session "$session" -p Type --value)
    user=$(loginctl show-session "$session" -p Name --value)
    ok "graphical session on seat0 ($type, user $user)"
else
    if [ "$mode" = live ]; then
        fail "no graphical session (the live system logs in automatically)"
    else
        info "no graphical session yet (log in at the login screen)"
    fi
fi
if [ -n "$session" ]; then
    check "Plasma desktop shell running" pgrep -x plasmashell
    check "KWin window manager running" pgrep -f 'kwin_(wayland|x11)'
    check "Welcome app started at login" pgrep -x zovelis-welcome
fi
if [ "$mode" = live ] && [ -n "$session" ]; then
    # Nobody knows the live user's password: the live session must never
    # lock itself, and must not ask to create a KDE wallet.
    live_home=$(getent passwd "$user" | cut -d: -f6)
    check "live session: no automatic screen lock" grep -qx 'Autolock=false' "$live_home/.config/kscreenlockerrc"
    check "live session: unlocking needs no password" grep -qx 'RequirePassword=false' "$live_home/.config/kscreenlockerrc"
    check "live session: KDE Wallet off" grep -qx 'Enabled=false' "$live_home/.config/kwalletrc"
fi
check "login screen theme is Zovelis" grep -qx 'Current=zovelis' /etc/sddm.conf.d/10-zovelis.conf
check "login screen service running" systemctl is-active sddm.service
if [ "$mode" = installed ] && [ -z "$session" ]; then
    # Nobody logged in yet: the login screen itself must be up.
    check "login screen shown (greeter running)" pgrep -f sddm-greeter
fi
check "boot splash theme is Zovelis" sh -c 'plymouth-set-default-theme | grep -qx zovelis'
check "default global theme is Zovelis Light" grep -qx 'LookAndFeelPackage=org.zovelis.light.desktop' /etc/xdg/kdeglobals

# --- Required applications ----------------------------------------------------
for p in firefox-esr dolphin konsole systemsettings plasma-discover flatpak zovelis-welcome; do
    check "installed: $p" installed "$p"
done

# --- Hardware support (through standard Linux components) ---------------------
check "NetworkManager running" systemctl is-active NetworkManager
check "Wi-Fi support installed (wpasupplicant)" installed wpasupplicant
check "printing filters installed (cups-filters)" installed cups-filters
check "Bluetooth service available" sh -c 'systemctl is-enabled bluetooth.service'
check "PipeWire audio packages present" installed pipewire-audio
for p in firmware-iwlwifi firmware-realtek firmware-sof-signed firmware-cirrus firmware-nvidia-graphics \
    intel-microcode amd64-microcode; do
    check "firmware installed: $p" installed "$p"
done
check "no network-switch firmware" sh -c '! dpkg-query -W -f "\${db:Status-Status}" firmware-marvell-prestera 2>/dev/null | grep -q installed'
check "removable storage service (udisks2)" systemctl is-active udisks2
info "network: $(nmcli -t -f STATE,CONNECTIVITY general 2>/dev/null)"

# --- Security -----------------------------------------------------------------
check "firewall active" sh -c 'ufw status | grep -qx "Status: active"'
check "firewall blocks incoming connections by default" sh -c 'ufw status verbose | grep -q "deny (incoming)"'
check "AppArmor enabled" aa-enabled
info "AppArmor: $(aa-status 2>/dev/null | head -n 2 | tr '\n' ' ')"
check "automatic security updates enabled" sh -c 'apt-config dump APT::Periodic::Unattended-Upgrade | grep -q "\"1\""'
check "update timers active" systemctl is-active apt-daily.timer apt-daily-upgrade.timer
check "Debian security updates configured" sh -c 'grep -rqs "security.debian.org" /etc/apt/sources.list /etc/apt/sources.list.d/'
check "no source package lines (smaller updates)" sh -c '! grep -rqsE "^[[:space:]]*(deb-src|Types:.*deb-src)" /etc/apt/sources.list /etc/apt/sources.list.d/'
check "Flathub available for sandboxed apps" sh -c 'flatpak remotes --system --columns=name | grep -qx flathub'
check "kernel pointers hidden" sh -c '[ "$(sysctl -n kernel.kptr_restrict)" -ge 1 ]'
check "ptrace restricted" sh -c '[ "$(sysctl -n kernel.yama.ptrace_scope)" -ge 1 ]'
check "ICMP redirects ignored" sh -c '[ "$(sysctl -n net.ipv4.conf.all.accept_redirects)" = 0 ]'
if installed openssh-server; then fail "SSH server installed"; else ok "no SSH server"; fi
# Network services listening on non-loopback addresses.
listening=$(ss -H -tulpn 2>/dev/null | awk '{print $1, $5, $7}' |
    grep -v -E ' (127\.[0-9.]+|\[::1\]|::1)(%[a-z0-9]+)?:' || true)
info "listening sockets (non-loopback):"
echo "$listening" | sed 's/^/      /'
unexpected=$(echo "$listening" | grep -v -E '^$|avahi-daemon|NetworkManager|dhclient|systemd-timesyn|chronyd|cupsd' || true)
if [ -n "$unexpected" ]; then fail "unexpected network services: $unexpected"; else ok "only expected network services listen"; fi

# --- Resource use ----------------------------------------------------------------
check "compressed swap in RAM (zram)" sh -c 'swapon --show=NAME --noheadings | grep -q zram'
check "small system log" sh -c 'systemd-analyze cat-config systemd/journald.conf | grep -q "^SystemMaxUse=256M"'
info "memory in use: $(free -m | awk '/^Mem:/ {print $3 " MiB of " $2 " MiB"}')"
info "running services: $(systemctl list-units --type=service --state=running --no-legend | wc -l)"
info "processes: $(ps -e --no-headers | wc -l)"

if [ "$mode" = installed ]; then
    # --- Installed system only -------------------------------------------------
    for p in live-boot live-config live-tools calamares calamares-settings-zovelis; do
        check "live/installer package removed: $p" sh -c "! dpkg-query -W -f '\${db:Status-Status}' $p 2>/dev/null | grep -q installed"
    done
    check "installer GRUB pool removed" test ! -e /usr/share/zovelis-installer
    check "no password-less sudo" sh -c '! grep -rEqs "^[^#]*NOPASSWD" /etc/sudoers /etc/sudoers.d'
    check "root account locked" sh -c 'passwd -S root | awk "{print \$2}" | grep -qx L'
    admin=$(getent group sudo | cut -d: -f4)
    if [ -n "$admin" ]; then ok "administrator account(s): $admin"; else fail "no user in the sudo group"; fi
    for u in $(echo "$admin" | tr ',' ' '); do
        home=$(getent passwd "$u" | cut -d: -f6)
        check "home of $u is private" sh -c "[ \"\$(stat -c %a '$home')\" = 700 ]"
        # The live session's "never lock" setting must not reach real users.
        check "screen of $u locks automatically" sh -c "! grep -qsxE 'Autolock=false|RequirePassword=false' '$home/.config/kscreenlockerrc'"
    done
    check "machine-id set" test -s /etc/machine-id
    check "initramfs without live-system hooks" sh -c '! lsinitramfs /boot/initrd.img-"$(uname -r)" | grep -q "scripts/live"'
    check "boot menu names Zovelis" grep -q 'Zovelis' /boot/grub/grub.cfg
    check "installer log kept for administrators" sh -c '[ "$(stat -c %a:%U:%G /var/log/installer/calamares.log)" = 640:root:adm ]'
    if [ -d /sys/firmware/efi ]; then
        check "UEFI: GRUB installed in EFI/zovelis" test -f /boot/efi/EFI/zovelis/grubx64.efi
        check "UEFI: Secure Boot shim installed" test -f /boot/efi/EFI/zovelis/shimx64.efi
        check "UEFI: fallback boot path present" sh -c 'ls /boot/efi/EFI/BOOT/BOOTX64.EFI /boot/efi/EFI/boot/bootx64.efi 2>/dev/null | grep -q .'
        # The FAT file system ignores case, so these paths match any spelling.
        check "UEFI: fallback path has the same GRUB settings" cmp -s /boot/efi/EFI/zovelis/grub.cfg /boot/efi/EFI/BOOT/grub.cfg
        check "UEFI: firmware boot entry" sh -c 'efibootmgr | grep -qi zovelis'
        check "UEFI: GRUB package for updates" installed grub-efi-amd64
        check "UEFI: updates keep the fallback path" sh -c 'debconf-show grub-efi-amd64 | grep -q "force_efi_extra_removable: true"'
        info "Secure Boot: $(mokutil --sb-state 2>/dev/null)"
    else
        check "BIOS: GRUB package for updates" installed grub-pc
        check "BIOS: GRUB updates know the boot disk" sh -c 'debconf-show grub-pc | grep -q "install_devices: /dev/"'
    fi
fi

echo "== $failures failure(s)"
[ "$failures" -eq 0 ]
