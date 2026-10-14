#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# Build the Zovelis OS Debian packages from packages/*/ into build/debs/ and
# check them with lintian. Run on Debian 13 (see setup-build-env.sh).
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

echo "=== lintian"
status=0
for deb in "$OUT"/*.deb; do
    # Errors fail the build; warnings are shown for review.
    lintian --fail-on error --no-tag-display-limit --profile debian \
        --suppress-tags-from-file "$ROOT/tests/lintian-suppressed-tags" "$deb" || status=1
done
ls -l "$OUT"
exit "$status"
