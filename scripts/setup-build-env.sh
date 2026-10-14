#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# Install everything needed to build and test Zovelis OS. Run as root on a
# Debian 13 (trixie) system, container or chroot.
set -eu

if ! grep -qs '^VERSION_CODENAME=trixie' /etc/os-release; then
    echo "setup-build-env: this must run on Debian 13 (trixie)" >&2
    exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install --yes --no-install-recommends \
    live-build debootstrap xorriso squashfs-tools mtools dosfstools \
    debhelper devscripts dpkg-dev fakeroot lintian \
    cmake ninja-build g++ pkgconf \
    qt6-base-dev qt6-declarative-dev qt6-declarative-dev-tools qt6-tools-dev-tools \
    qt6-qpa-plugins qt6-svg-plugins qml6-module-qtquick qml6-module-qtquick-controls \
    qml6-module-qtquick-layouts qml6-module-qtquick-templates qml6-module-qtquick-window \
    qml6-module-qtqml-workerscript \
    grub-common fonts-noto-core fonts-noto-mono \
    python3 python3-yaml python3-jsonschema python3-pil \
    shellcheck desktop-file-utils appstream libxml2-utils nodejs \
    gnupg curl ca-certificates \
    qemu-system-x86 qemu-utils ovmf
echo "setup-build-env: done"
