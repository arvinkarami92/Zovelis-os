#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# Build the Zovelis OS live/installation ISO with live-build.
#
#   sudo ./scripts/build-iso.sh
#
# Needs: Debian 13 (trixie) build environment (scripts/setup-build-env.sh),
# root, ~25 GB free disk, and the packages from scripts/build-packages.sh.
#
# Environment:
#   ZOVELIS_MIRROR / ZOVELIS_SECURITY_MIRROR  mirrors used during the build
#       (the image itself always points at deb.debian.org / security.debian.org)
#   ZOVELIS_VERSION   version string (default 1.0)
#   ZOVELIS_KEEP_CACHE=1  keep live-build's package cache between builds
set -eu
cd "$(dirname "$0")/.."
ROOT=$(pwd)
WORK=$ROOT/build/live
DEBS=$ROOT/build/debs
VERSION=${ZOVELIS_VERSION:-1.0}
export ZOVELIS_VERSION="$VERSION"

log() { echo "build-iso: $*"; }
die() { echo "build-iso: ERROR: $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "run as root (live-build needs it)"
command -v lb >/dev/null || die "live-build is not installed (scripts/setup-build-env.sh)"
grep -qs '^VERSION_CODENAME=trixie' /etc/os-release || die "build on Debian 13 (trixie)"
ls "$DEBS"/*.deb >/dev/null 2>&1 || die "no packages in $DEBS; run scripts/build-packages.sh first"

# 1. Fresh work directory (optionally keeping the package cache).
if [ -d "$WORK" ]; then
    if [ "${ZOVELIS_KEEP_CACHE:-0}" = 1 ] && [ -d "$WORK/cache" ]; then
        mv "$WORK/cache" "$ROOT/build/lb-cache.keep"
    fi
    (cd "$WORK" && lb clean --purge >/dev/null 2>&1 || true)
    rm -rf "$WORK"
fi
mkdir -p "$WORK"
cp -a live-build/. "$WORK/"
if [ -d "$ROOT/build/lb-cache.keep" ]; then
    mv "$ROOT/build/lb-cache.keep" "$WORK/cache"
fi

# 2. Our packages, installed into the image from a local repository.
#    (Git does not keep empty directories, so create it here.)
mkdir -p "$WORK/config/packages.chroot"
cp "$DEBS"/*.deb "$WORK/config/packages.chroot/"

# 3. Fonts for the Zovelis boot menu (GRUB can only use its own bitmap
#    font format; made from Noto Sans like the desktop's fonts).
NOTO=/usr/share/fonts/truetype/noto
for spec in regular-16:NotoSans-Regular regular-20:NotoSans-Regular bold-20:NotoSans-Bold; do
    size=${spec%%:*}; size=${size#*-}
    weight=${spec%%-*}
    grub-mkfont -s "$size" -o "$WORK/config/bootloaders/grub-pc/noto-sans-$weight-$size.pf2" \
        "$NOTO/${spec#*:}.ttf"
done

# 4. Build. (auto/build writes build.log and fails when no image was made.)
cd "$WORK"
lb config
lb build || die "live-build failed; see $WORK/build.log"
iso=$(ls ./*.iso 2>/dev/null | head -n 1)
[ -n "$iso" ] || die "live-build did not produce an ISO; see $WORK/build.log"

# 5. Results.
mkdir -p "$ROOT/build/out"
name=zovelis-os-$VERSION-amd64.iso
mv "$iso" "$ROOT/build/out/$name"
for extra in ./*.packages ./*.contents ./*.files; do
    [ -e "$extra" ] && mv "$extra" "$ROOT/build/out/zovelis-os-$VERSION-amd64.${extra##*.}"
done
cd "$ROOT/build/out"
sha256sum "$name" > "$name.sha256"
log "built $ROOT/build/out/$name ($(du -h "$name" | cut -f1))"
cat "$name.sha256"
