#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# Boot the Zovelis OS ISO in QEMU (BIOS and UEFI) and check the live system
# from the inside through the QEMU guest agent.
#
#   tests/vm/run-vm-tests.sh build/out/zovelis-os-1.0-amd64.iso [bios] [uefi] [uefi-secure]
#
# Results (logs and screenshots) go to build/vm-results/. Works with or
# without KVM; without it (pure emulation) expect ~10-20 minutes per boot.
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
VMCTL="python3 $HERE/vmctl.py"

ISO=${1:?usage: run-vm-tests.sh ISO [bios|uefi|uefi-secure]...}
shift
[ -f "$ISO" ] || { echo "no such ISO: $ISO" >&2; exit 1; }
ISO=$(cd "$(dirname "$ISO")" && pwd)/$(basename "$ISO")
[ "$#" -gt 0 ] || set -- bios uefi

OUT=$ROOT/build/vm-results
mkdir -p "$OUT"
failures=0

for firmware in "$@"; do
    name=live-$firmware
    dir=$OUT/$name
    rm -rf "$dir"
    mkdir -p "$dir"
    echo "=== $name: booting $(basename "$ISO")"
    $VMCTL stop --name "$name" --force >/dev/null 2>&1 || true
    $VMCTL start --name "$name" --iso "$ISO" --firmware "$firmware" --reset-efivars

    # Screenshots during boot (boot menu, splash, login, desktop).
    (
        i=0
        while [ "$i" -lt 120 ]; do
            i=$((i + 1))
            $VMCTL screenshot --name "$name" "$dir/boot-$(printf %03d "$i").png" >/dev/null 2>&1 || exit 0
            sleep 15
        done
    ) &
    shooter=$!

    if ! $VMCTL wait-agent --name "$name" --timeout 2700; then
        echo "FAIL: $name did not finish booting"
        failures=$((failures + 1))
        kill "$shooter" 2>/dev/null || true
        $VMCTL stop --name "$name" --force || true
        continue
    fi
    # Give the automatic login and the desktop time to come up.
    tries=0
    while [ "$tries" -lt 90 ]; do
        if $VMCTL exec --name "$name" -- pgrep -x plasmashell >/dev/null 2>&1; then
            break
        fi
        tries=$((tries + 1))
        sleep 10
    done
    sleep 90
    kill "$shooter" 2>/dev/null || true
    $VMCTL screenshot --name "$name" "$dir/desktop.png" >/dev/null || echo "note: no desktop screenshot"

    if $VMCTL exec --name "$name" --stdin --timeout 600 -- /bin/sh -s live \
        <"$HERE/guest-checks.sh" >"$dir/guest-checks.log" 2>&1; then
        echo "PASS: $name"
    else
        echo "FAIL: $name (see $dir/guest-checks.log)"
        failures=$((failures + 1))
    fi
    grep -E '^(FAIL|info)' "$dir/guest-checks.log" | sed 's/^/      /' || true
    $VMCTL exec --name "$name" -- journalctl -b --no-pager -p warning >"$dir/journal-warnings.log" 2>&1 || true
    $VMCTL stop --name "$name" --timeout 120 || $VMCTL stop --name "$name" --force
done

[ "$failures" -eq 0 ] && echo "all VM tests passed" || echo "$failures VM test(s) failed"
[ "$failures" -eq 0 ]
