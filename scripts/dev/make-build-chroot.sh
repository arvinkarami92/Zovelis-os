#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# Create a Debian 13 build chroot on a non-Debian Linux host (no Docker
# needed), then run commands in it with the source tree mounted at /src.
#
#   sudo scripts/dev/make-build-chroot.sh create      # once
#   sudo scripts/dev/make-build-chroot.sh run ./scripts/build-packages.sh
#   sudo scripts/dev/make-build-chroot.sh run ./scripts/build-iso.sh
#   sudo scripts/dev/make-build-chroot.sh shell
#
# ZOVELIS_MIRROR and ZOVELIS_SECURITY_MIRROR (as for build-iso.sh) may point
# at scripts/dev/apt-https-relay.py on hosts behind a TLS-intercepting proxy;
# the chroot then uses them too, and passes them on to the build scripts.
#
# Trust: everything is checked against Debian's archive signing keys, taken
# either from the host's debian-archive-keyring package (Ubuntu, Mint and
# most other distributions ship it) or, when ZOVELIS_DEBIAN_KEYS lists their
# fingerprints (see https://ftp-master.debian.org/keys.html, "Debian Archive
# Automatic Signing Key (13/trixie)" and "(12/bookworm)"), from the archive's
# own keyring package, of which only the listed keys are used. The archive's
# signed Release file vouches for the package index, the index for
# debootstrap, and debootstrap checks everything it installs.
set -eu
cd "$(dirname "$0")/../.."
SRC=$(pwd)
CHROOT=${ZOVELIS_CHROOT:-/srv/zovelis-build}
MIRROR=${ZOVELIS_MIRROR:-https://deb.debian.org/debian}
MIRROR=${MIRROR%/}
SECURITY_MIRROR=${ZOVELIS_SECURITY_MIRROR:-https://security.debian.org/debian-security}
SECURITY_MIRROR=${SECURITY_MIRROR%/}
TOOLS=$SRC/build/bootstrap-tools
HOST_KEYRING=/usr/share/keyrings/debian-archive-keyring.gpg

die() { echo "make-build-chroot: $*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || die "run as root"

fetch() {  # fetch URL FILE
    curl --fail --silent --show-error --location -o "$2" "$1"
}

mount_all() {
    for fs in proc sys dev dev/pts run; do
        mkdir -p "$CHROOT/$fs"
        mountpoint -q "$CHROOT/$fs" && continue
        case $fs in
            proc) mount -t proc proc "$CHROOT/proc" ;;
            sys) mount -t sysfs sys "$CHROOT/sys" ;;
            dev) mount --bind /dev "$CHROOT/dev" ;;
            dev/pts) mount -t devpts devpts "$CHROOT/dev/pts" -o gid=5,mode=620 ;;
            run) mount -t tmpfs tmpfs "$CHROOT/run" ;;
        esac
    done
    mkdir -p "$CHROOT/src"
    mountpoint -q "$CHROOT/src" || mount --bind "$SRC" "$CHROOT/src"
    cp -L /etc/resolv.conf "$CHROOT/etc/resolv.conf" 2>/dev/null || true
}

umount_all() {
    for fs in src run dev/pts dev sys proc; do
        mountpoint -q "$CHROOT/$fs" && umount -l "$CHROOT/$fs"
    done
    return 0
}

# fetch_package NAME: download the package NAME named in the archive index
# to $TOOLS/NAME.deb; prints the SHA-256 sum the index gives for it.
fetch_package() {
    record=$(awk -v p="$1" '
        /^$/ { if (name == p) { found = 1; exit } name = file = sum = "" }
        $1 == "Package:" { name = $2 } $1 == "Filename:" { file = $2 } $1 == "SHA256:" { sum = $2 }
        END { if (name == p) print file, sum }' "$TOOLS/Packages")
    path=${record% *}
    sum=${record#* }
    [ -n "$record" ] && [ -n "$path" ] && [ -n "$sum" ] || die "$1 not found in the archive index"
    case $path in
        pool/*..* | pool/*[!A-Za-z0-9._+~/-]*) die "unexpected file name for $1: $path" ;;
        pool/*) ;;
        *) die "unexpected file name for $1: $path" ;;
    esac
    fetch "$MIRROR/$path" "$TOOLS/$1.deb"
    echo "$sum"
}

create() {
    [ ! -e "$CHROOT/etc/debian_version" ] || die "$CHROOT already exists"
    for tool in curl gpg gpgv xz dpkg-deb sha256sum; do
        command -v "$tool" >/dev/null 2>&1 || die "$tool is needed"
    done
    rm -rf "$TOOLS"
    mkdir -p "$TOOLS/gnupg"
    chmod 0700 "$TOOLS/gnupg"
    # GnuPG works in a scratch home, never in root's.
    GNUPGHOME=$TOOLS/gnupg
    export GNUPGHOME
    # 1. The package index of the archive. It is checked in step 3; until
    #    then it only serves to find the keyring package, whose keys are
    #    checked by fingerprint.
    fetch "$MIRROR/dists/trixie/main/binary-all/Packages.xz" "$TOOLS/Packages.xz"
    xz -dc "$TOOLS/Packages.xz" > "$TOOLS/Packages" || die "cannot read the package index"
    # 2. The keys to trust.
    keyring=$TOOLS/trusted-keys.gpg
    if [ -n "${ZOVELIS_DEBIAN_KEYS:-}" ]; then
        # The keyring package is not checked yet: read its key files without
        # unpacking anything, and keep only the keys whose fingerprints were
        # given (a fingerprint cannot be forged).
        fetch_package debian-archive-keyring > /dev/null
        dpkg-deb --fsys-tarfile "$TOOLS/debian-archive-keyring.deb" | tar -tvf - |
            awk '$1 ~ /^-/ && $NF ~ /^\.\/usr\/share\/keyrings\/[A-Za-z0-9._-]+\.(gpg|pgp)$/ { print $NF }' \
            > "$TOOLS/key-files"
        [ -s "$TOOLS/key-files" ] || die "no keys in the archive keyring package"
        : > "$TOOLS/archive-keys.gpg"
        while read -r member; do
            dpkg-deb --fsys-tarfile "$TOOLS/debian-archive-keyring.deb" | tar -xOf - "$member" \
                >> "$TOOLS/archive-keys.gpg"
        done < "$TOOLS/key-files"
        fingerprints=
        for fpr in $ZOVELIS_DEBIAN_KEYS; do
            fpr=$(printf '%s' "$fpr" | tr 'a-f' 'A-F')
            case $fpr in
                *[!0-9A-F]*) die "not a fingerprint: $fpr (40 hexadecimal digits, no spaces)" ;;
            esac
            [ "${#fpr}" -eq 40 ] || die "not a fingerprint: $fpr (40 hexadecimal digits, no spaces)"
            fingerprints="$fingerprints $fpr"
        done
        # shellcheck disable=SC2086 # one argument per fingerprint
        gpg --batch --quiet --no-default-keyring --keyring "$TOOLS/archive-keys.gpg" \
            --export $fingerprints > "$keyring"
        for fpr in $fingerprints; do
            gpg --batch --show-keys --with-colons "$keyring" 2>/dev/null |
                grep -q "^fpr:::::::::$fpr:" || die "archive key $fpr not found"
        done
    elif [ -s "$HOST_KEYRING" ]; then
        cp "$HOST_KEYRING" "$keyring"
    else
        die "no Debian archive keys: install debian-archive-keyring, or set ZOVELIS_DEBIAN_KEYS"
    fi
    # 3. The signed Release file vouches for the package index ...
    fetch "$MIRROR/dists/trixie/InRelease" "$TOOLS/InRelease"
    gpgv --status-fd 3 --keyring "$keyring" --output "$TOOLS/Release" "$TOOLS/InRelease" \
        3>"$TOOLS/gpgv.status" 2>"$TOOLS/gpgv.log" || true
    if ! grep -q '^\[GNUPG:\] GOODSIG ' "$TOOLS/gpgv.status" ||
        grep -q '^\[GNUPG:\] BADSIG ' "$TOOLS/gpgv.status"; then
        cat "$TOOLS/gpgv.log" >&2
        die "the archive's Release file is not signed by a trusted Debian key"
    fi
    want=$(awk '$1 == "SHA256:" { s = 1; next } /^[^ ]/ { s = 0 }
        s && $3 == "main/binary-all/Packages.xz" { print $1 }' "$TOOLS/Release")
    [ -n "$want" ] || die "the Release file does not list the package index"
    echo "$want  $TOOLS/Packages.xz" | sha256sum -c --quiet - || die "the package index was modified"
    # ... and the index for debootstrap.
    sum=$(fetch_package debootstrap)
    echo "$sum  $TOOLS/debootstrap.deb" | sha256sum -c --quiet - || die "debootstrap does not match the archive index"
    rm -rf "${TOOLS:?}/debootstrap"
    dpkg-deb -x "$TOOLS/debootstrap.deb" "$TOOLS/debootstrap"
    # 4. Minimal trixie system (debootstrap checks every package).
    DEBOOTSTRAP_DIR=$TOOLS/debootstrap/usr/share/debootstrap \
        "$TOOLS/debootstrap/usr/sbin/debootstrap" --keyring="$keyring" --variant=minbase \
        --include=ca-certificates,curl,gnupg,sudo,xz-utils trixie "$CHROOT" "$MIRROR"
    cat >"$CHROOT/etc/apt/sources.list" <<SOURCES
deb $MIRROR trixie main contrib non-free-firmware
deb $MIRROR trixie-updates main contrib non-free-firmware
deb $SECURITY_MIRROR trixie-security main contrib non-free-firmware
SOURCES
    # 5. Build tools.
    mount_all
    trap umount_all EXIT
    chroot "$CHROOT" /src/scripts/setup-build-env.sh
    echo "make-build-chroot: ready in $CHROOT"
}

case "${1:-}" in
    create) create ;;
    run)
        shift
        mount_all
        trap umount_all EXIT
        chroot "$CHROOT" /usr/bin/env -i HOME=/root PATH=/usr/sbin:/usr/bin:/sbin:/bin LANG=C.UTF-8 \
            ZOVELIS_MIRROR="${ZOVELIS_MIRROR:-}" ZOVELIS_SECURITY_MIRROR="${ZOVELIS_SECURITY_MIRROR:-}" \
            sh -c 'cd /src && exec "$@"' sh "$@"
        ;;
    shell)
        mount_all
        trap umount_all EXIT
        chroot "$CHROOT" /bin/bash -c 'cd /src && exec bash -l'
        ;;
    umount) umount_all ;;
    *) die "usage: make-build-chroot.sh create|run COMMAND...|shell|umount" ;;
esac
