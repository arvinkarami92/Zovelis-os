#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# Tests live-build/auto/finish-chroot (run between "lb chroot" and
# "lb binary") on stand-in root file systems, with a stand-in for
# "chroot ROOT dpkg-divert": whatever live-build leaves of its temporary
# /etc/os-release, the image must end up with the symlink to Zovelis'
# /usr/lib/os-release.
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
SCRIPT=$HERE/../../live-build/auto/finish-chroot
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT HUP INT TERM
mkdir -p "$T/bin"
cat > "$T/bin/chroot" <<'STUB'
#!/bin/sh
root=$1; shift
[ "$1" = dpkg-divert ] || exit 99
shift
case "$*" in
    "--list /etc/os-release")
        [ -e "$root/.diverted" ] && echo "local diversion of /etc/os-release to /etc/os-release.debootstrap"
        exit 0 ;;
    "--rename --remove /etc/os-release")
        rm -f "$root/.diverted"
        if [ -e "$root/etc/os-release.debootstrap" ] || [ -L "$root/etc/os-release.debootstrap" ]; then
            # dpkg-divert refuses to overwrite an existing file.
            if [ -e "$root/etc/os-release" ] || [ -L "$root/etc/os-release" ]; then exit 2; fi
            mv "$root/etc/os-release.debootstrap" "$root/etc/os-release"
        fi
        exit 0 ;;
esac
exit 98
STUB
chmod 0755 "$T/bin/chroot"

failures=0
setup() {
    rm -rf "$T/w"
    mkdir -p "$T/w/chroot/etc" "$T/w/chroot/usr/lib" "$T/w/auto"
    printf 'NAME="Zovelis OS"\nID=zovelis\nPRETTY_NAME="Zovelis OS 1.0"\n' > "$T/w/chroot/usr/lib/os-release"
    cp "$SCRIPT" "$T/w/auto/"
}
run() {  # run DESCRIPTION EXPECTED-STATUS
    set +e
    (cd "$T/w" && PATH="$T/bin:$PATH" sh ./auto/finish-chroot) >"$T/out" 2>&1
    rc=$?
    set -e
    link=$(readlink "$T/w/chroot/etc/os-release" || true)
    if [ "$rc" -eq "$2" ] && { [ "$2" -ne 0 ] || [ "$link" = ../usr/lib/os-release ]; } &&
        [ ! -e "$T/w/chroot/.diverted" ] && [ ! -e "$T/w/chroot/etc/os-release.debootstrap" ]; then
        echo "ok:   $1"
    else
        echo "FAIL: $1 (exit $rc, /etc/os-release -> '$link')"
        sed 's/^/      /' "$T/out"
        failures=$((failures + 1))
    fi
}

setup; echo ID=debian > "$T/w/chroot/etc/os-release"; ln -s ../usr/lib/os-release "$T/w/chroot/etc/os-release.debootstrap"
: > "$T/w/chroot/.diverted"
run "live-build's diversion with the original symlink set aside" 0
setup; echo ID=debian > "$T/w/chroot/etc/os-release"; : > "$T/w/chroot/.diverted"
run "live-build's diversion without the original" 0
setup; echo ID=debian > "$T/w/chroot/etc/os-release"
run "live-build's file left behind without a diversion" 0
setup; ln -s ../usr/lib/os-release "$T/w/chroot/etc/os-release"
run "already the symlink (live-build removed its diversion)" 0
setup; ln -s ../usr/lib/os-release "$T/w/chroot/etc/os-release"; echo ID=debian > "$T/w/chroot/usr/lib/os-release"
run "zovelis-base's os-release missing: the build stops" 1

[ "$failures" -eq 0 ] || { echo "$failures finish-chroot check(s) failed"; exit 1; }
echo "all finish-chroot checks passed"
