#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# Tests for the installer helper scripts (calamares-settings-zovelis/scripts)
# against fake target systems. They check input validation (the scripts run
# as root and must refuse anything unexpected without touching the disk) and
# the cleanup rules. Needs root for the bind mounts that make the fake
# targets look like mount points; skipped otherwise.
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
SCRIPTS=$HERE/../../packages/calamares-settings-zovelis/scripts

if [ "$(id -u)" -ne 0 ] || ! command -v unshare >/dev/null 2>&1; then
    echo "SKIP: needs root and unshare"
    exit 0
fi

tmp=$(mktemp -d)
cleanup() {
    for m in $(awk -v t="$tmp" '$2 ~ "^" t {print $2}' /proc/mounts | sort -r); do
        umount "$m" 2>/dev/null || true
    done
    rm -rf "$tmp"
}
trap cleanup EXIT HUP INT TERM

failures=0
expect() {
    expected=$1
    description=$2
    shift 2
    set +e
    "$@" >"$tmp/out" 2>&1
    rc=$?
    set -e
    if [ "$rc" -eq "$expected" ]; then
        echo "ok:   $description"
    else
        echo "FAIL: $description (exit $rc, expected $expected)"
        sed 's/^/      /' "$tmp/out"
        failures=$((failures + 1))
    fi
}
check() {
    if eval "$2"; then echo "ok:   $1"; else echo "FAIL: $1"; failures=$((failures + 1)); fi
}

# A fake target that is a mount point (bind mount onto itself).
make_target() {
    t=$tmp/$1
    mkdir -p "$t/etc/apt/sources.list.d" "$t/etc/sudoers.d" "$t/etc/ufw" "$t/usr/bin" "$t/tmp" \
        "$t/boot/grub" "$t/var/lib/systemd" "$t/usr/share/zovelis-installer/pool"
    mount --bind "$t" "$t"
    echo "$t"
}

# --- prepare-bootloader: input validation ---------------------------------
plain=$tmp/plain
mkdir -p "$plain"
expect 1 "prepare-bootloader: no arguments" "$SCRIPTS/prepare-bootloader"
expect 1 "prepare-bootloader: unknown firmware" "$SCRIPTS/prepare-bootloader" coreboot /mnt
expect 1 "prepare-bootloader: relative target" "$SCRIPTS/prepare-bootloader" efi mnt
expect 1 "prepare-bootloader: refuses the running system" "$SCRIPTS/prepare-bootloader" efi /
expect 1 "prepare-bootloader: target must be a mount point" "$SCRIPTS/prepare-bootloader" efi "$plain"
t1=$(make_target t1)
expect 1 "prepare-bootloader: target must contain a system" "$SCRIPTS/prepare-bootloader" efi "$t1"
: > "$t1/usr/bin/apt-get"
chmod 0755 "$t1/usr/bin/apt-get"
expect 0 "prepare-bootloader: BIOS without a boot loader location is skipped" "$SCRIPTS/prepare-bootloader" bios "$t1" ""
expect 1 "prepare-bootloader: BIOS disk must be a block device" "$SCRIPTS/prepare-bootloader" bios "$t1" /etc/passwd

# --- finish-bootloader ------------------------------------------------------
expect 1 "finish-bootloader: refuses the running system" "$SCRIPTS/finish-bootloader" efi /
expect 1 "finish-bootloader: unknown firmware" "$SCRIPTS/finish-bootloader" coreboot "$t1"
expect 0 "finish-bootloader: BIOS without a boot loader location" "$SCRIPTS/finish-bootloader" bios "$t1" ""
expect 1 "finish-bootloader: BIOS with missing GRUB menu" "$SCRIPTS/finish-bootloader" bios "$t1" /dev/sda
printf 'set timeout=5\nmenuentry "Zovelis GNU/Linux" {\n}\n' > "$t1/boot/grub/grub.cfg"
expect 0 "finish-bootloader: BIOS with a GRUB menu" "$SCRIPTS/finish-bootloader" bios "$t1" /dev/sda
expect 1 "finish-bootloader: UEFI needs the EFI partition mounted" "$SCRIPTS/finish-bootloader" efi "$t1"

# --- cleanup-target -----------------------------------------------------------
t2=$(make_target t2)
echo 0123456789abcdef0123456789abcdef > "$t2/etc/machine-id"
printf 'ENABLED=no\nLOGLEVEL=low\n' > "$t2/etc/ufw/ufw.conf"
echo 'Types: deb' > "$t2/etc/apt/sources.list.d/debian.sources"
echo 'URIs: https://deb.debian.org/debian' >> "$t2/etc/apt/sources.list.d/debian.sources"
echo seed > "$t2/var/lib/systemd/random-seed"
chmod 0644 "$t2/var/lib/systemd/random-seed"
mkdir -p "$t2/tmp/zovelis-grub.abc123"
expect 0 "cleanup-target: clean system passes" "$SCRIPTS/cleanup-target" "$t2"
check "cleanup-target: firewall switched on" "grep -qx 'ENABLED=yes' '$t2/etc/ufw/ufw.conf'"
check "cleanup-target: GRUB pool removed" "[ ! -e '$t2/usr/share/zovelis-installer' ]"
check "cleanup-target: staging directory removed" "[ ! -e '$t2/tmp/zovelis-grub.abc123' ]"
check "cleanup-target: random seed private" "[ \"\$(stat -c %a '$t2/var/lib/systemd/random-seed')\" = 600 ]"

echo 'zovelis ALL=(ALL) NOPASSWD: ALL' > "$t2/etc/sudoers.d/live"
expect 1 "cleanup-target: password-less sudo is refused" "$SCRIPTS/cleanup-target" "$t2"
rm "$t2/etc/sudoers.d/live"
echo 'deb [trusted=yes] file:/run/live/medium trixie main' > "$t2/etc/apt/sources.list"
expect 1 "cleanup-target: medium as package source is refused" "$SCRIPTS/cleanup-target" "$t2"
rm "$t2/etc/apt/sources.list"
: > "$t2/etc/machine-id"
expect 1 "cleanup-target: empty machine-id is refused" "$SCRIPTS/cleanup-target" "$t2"
echo 0123456789abcdef0123456789abcdef > "$t2/etc/machine-id"
mkdir -p "$t2/usr/share/polkit-1/rules.d"
: > "$t2/usr/share/polkit-1/rules.d/49-zovelis-installer.rules"
expect 1 "cleanup-target: leftover installer polkit rule is refused" "$SCRIPTS/cleanup-target" "$t2"
rm "$t2/usr/share/polkit-1/rules.d/49-zovelis-installer.rules"
expect 0 "cleanup-target: passes again once fixed" "$SCRIPTS/cleanup-target" "$t2"

# --- live-session-only scripts ------------------------------------------------
home=$tmp/home
mkdir -p "$home"
expect 0 "add-desktop-icon: does nothing outside the live system" env HOME="$home" "$SCRIPTS/add-desktop-icon"
check "add-desktop-icon: no icon outside the live system" "[ ! -e '$home/Desktop/install-zovelis.desktop' ]"
# Inside a private mount namespace, pretend to be the live system.
mkdir -p "$tmp/apps"
cp "$SCRIPTS/../data/install-zovelis.desktop" "$tmp/apps/"
expect 0 "add-desktop-icon: puts the installer on the live desktop" unshare --mount sh -c "
    mount -t tmpfs none /run && mkdir -p /run/live/medium &&
    mount --bind '$tmp/apps' /usr/share/applications &&
    HOME='$home' XDG_CONFIG_HOME='$home/.config' '$SCRIPTS/add-desktop-icon'"
check "add-desktop-icon: launcher is executable" "[ -x '$home/Desktop/install-zovelis.desktop' ]"
expect 1 "run-calamares: refuses to run without root" setpriv --reuid=65534 --regid=65534 --clear-groups "$SCRIPTS/run-calamares"
expect 1 "run-calamares: refuses outside the live system" "$SCRIPTS/run-calamares"
expect 1 "zovelis-install: refuses outside the live system" env -u DISPLAY "$SCRIPTS/zovelis-install"

if [ "$failures" -ne 0 ]; then
    echo "$failures installer helper check(s) failed"
    exit 1
fi
echo "all installer helper checks passed"
