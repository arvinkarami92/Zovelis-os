#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# Build Zovelis OS on any Linux machine with Docker or Podman: runs the whole
# build (packages, ISO, static checks) in a Debian 13 container.
#
#   ./scripts/build-in-container.sh            # packages + ISO
#   ./scripts/build-in-container.sh check      # static checks only
#
# live-build creates a chroot and mounts /proc etc. inside it, so the
# container must be privileged. Output: build/out/zovelis-os-*.iso
set -eu
cd "$(dirname "$0")/.."
ROOT=$(pwd)

# live-build's chroot needs real device nodes (/dev/null and friends), which
# only a rootful container can create: Docker (its daemon runs as root) or
# Podman started as root. Rootless Podman would leave /dev/null a plain file
# inside the image chroot and package scripts would fail.
engine=${CONTAINER_ENGINE:-}
if [ -z "$engine" ]; then
    if [ "$(id -u)" -ne 0 ] && command -v docker >/dev/null 2>&1; then engine=docker
    elif command -v podman >/dev/null 2>&1; then engine=podman
    elif command -v docker >/dev/null 2>&1; then engine=docker
    else echo "install docker or podman" >&2; exit 1
    fi
fi
if [ "$engine" = podman ] && [ "$(id -u)" -ne 0 ] && [ "${1:-all}" != check ]; then
    echo "build-in-container: rootless Podman cannot create the device nodes live-build needs;" >&2
    echo "run it as root:  sudo $0 ${*:-all}" >&2
    exit 1
fi

what=${1:-all}
case "$what" in
    all) inner="./scripts/build-packages.sh && ./scripts/build-iso.sh" ;;
    packages) inner="./scripts/build-packages.sh" ;;
    check) inner="./tests/run-static-checks.sh" ;;
    *) echo "usage: build-in-container.sh [all|packages|check]" >&2; exit 2 ;;
esac

image=docker.io/library/debian:trixie
exec "$engine" run --rm --privileged \
    -v "$ROOT:/src" -w /src \
    -e ZOVELIS_MIRROR -e ZOVELIS_SECURITY_MIRROR -e ZOVELIS_VERSION -e ZOVELIS_LINTIAN \
    "$image" sh -c "./scripts/setup-build-env.sh && $inner"
