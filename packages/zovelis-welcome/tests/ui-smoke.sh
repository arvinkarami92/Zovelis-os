#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# Renders every page of Zovelis Welcome in the live and installed modes, with
# the Zovelis Light and Dark colour schemes, at a normal and a small window
# size. Any QML warning, binding error or failed render fails the test.
set -eu

APP=${1:?usage: ui-smoke.sh path/to/zovelis-welcome output-dir fixtures-dir}
OUT=${2:?}
FIXTURES=${3:?}

rm -rf "$OUT"
mkdir -p "$OUT"
config=$(mktemp -d)
trap 'rm -rf "$config"' EXIT
# Never read or write the real user's settings.
export XDG_CONFIG_HOME="$config/config"
export XDG_RUNTIME_DIR="$config/runtime"
mkdir -p "$XDG_RUNTIME_DIR" && chmod 0700 "$XDG_RUNTIME_DIR"
export QT_QPA_PLATFORM=${QT_QPA_PLATFORM:-offscreen}
export QT_QUICK_BACKEND=${QT_QUICK_BACKEND:-software}
export QT_QUICK_CONTROLS_STYLE=${QT_QUICK_CONTROLS_STYLE:-Fusion}

failures=0
for scheme in Light Dark; do
    for mode in installed live; do
        for size in 900x660 520x620; do
            prefix="$mode-$(echo $scheme | tr 'A-Z' 'a-z')-$size-"
            if "$APP" --strict --"$mode" --sysroot "$FIXTURES/sysroot" \
                    --color-scheme "$FIXTURES/Zovelis$scheme.colors" \
                    --size "$size" --screenshot-dir "$OUT" --screenshot-prefix "$prefix" >"$OUT/$prefix.log" 2>&1; then
                echo "ok:   $mode / $scheme / $size ($(grep -c '^screenshot:' "$OUT/$prefix.log") pages)"
            else
                echo "FAIL: $mode / $scheme / $size"
                sed 's/^/      /' "$OUT/$prefix.log"
                failures=$((failures + 1))
            fi
        done
    done
done

# Dry-run mode must never write anything outside XDG_CONFIG_HOME.
if [ -n "$(find "$FIXTURES/sysroot" -newer "$OUT" -type f 2>/dev/null)" ]; then
    echo "FAIL: files in the fixture sysroot were modified"
    failures=$((failures + 1))
fi

[ "$failures" -eq 0 ] || { echo "$failures configuration(s) failed"; exit 1; }
echo "all UI smoke tests passed; screenshots in $OUT"
