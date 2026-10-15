#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# Build the Zovelis OS Debian packages from packages/*/ into build/debs/ and
# check them with lintian. Run on Debian 13 (see setup-build-env.sh).
#
# ZOVELIS_LINTIAN=warn (default) shows lintian's findings; =strict makes
# lintian errors fail the build (use it before a release); =off skips it.
set -eu
cd "$(dirname "$0")/.."
ROOT=$(pwd)
OUT=$ROOT/build/debs
WORK=$ROOT/build/package-work

./scripts/fetch-flathub-remote.sh

rm -rf "$OUT" "$WORK"
mkdir -p "$OUT" "$WORK"

for dir in packages/*/; do
    name=$(basename "$dir")
    [ -f "$dir/debian/control" ] || continue
    echo "=== building $name"
    # Build from a clean copy so the source tree stays pristine.
    cp -a "$dir" "$WORK/$name"
    (cd "$WORK/$name" && dpkg-buildpackage --build=binary --no-sign -j"$(nproc)")
    mv "$WORK"/*.deb "$OUT"/
    rm -f "$WORK"/*.buildinfo "$WORK"/*.changes
done

mode=${ZOVELIS_LINTIAN:-warn}
status=0
case "$mode" in
    off) echo "=== lintian skipped (ZOVELIS_LINTIAN=off)" ;;
    warn | strict)
        echo "=== lintian ($mode)"
        for deb in "$OUT"/*.deb; do
            lintian --fail-on error --no-tag-display-limit --profile debian \
                --suppress-tags-from-file "$ROOT/tests/lintian-suppressed-tags" "$deb" || status=1
        done
        if [ "$status" -ne 0 ] && [ "$mode" = warn ]; then
            echo "=== lintian reported errors (see above); continuing because ZOVELIS_LINTIAN=warn"
            status=0
        fi
        ;;
    *) echo "ZOVELIS_LINTIAN must be warn, strict or off (got '$mode')" >&2; exit 2 ;;
esac
ls -l "$OUT"
exit "$status"
