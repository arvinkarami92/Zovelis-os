#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# Exercises zovelis-admin-helper against a temporary directory: argument
# validation, file contents and permissions, atomic replacement (no symlink
# following) and refusal to run without root privileges.
set -eu

HELPER=${1:?usage: test-admin-helper.sh path/to/zovelis-admin-helper}
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
conf="$tmp/apt.conf.d"
mkdir -p "$conf"

# Test copy aimed at the temporary directory. The shipped helper has no
# override of any kind (it must not trust its environment).
sed -e "s|^APT_CONF_DIR=/etc/apt/apt.conf.d\$|APT_CONF_DIR=$conf|" \
    -e 's|command -v debconf-set-selections|false|' "$HELPER" > "$tmp/helper"
grep -q "^APT_CONF_DIR=$conf\$" "$tmp/helper" || { echo "FAIL: could not retarget the helper"; exit 1; }
chmod 0755 "$tmp/helper"

# Run as (namespaced) root when we are not root ourselves.
if [ "$(id -u)" -eq 0 ]; then
    asroot=""
elif unshare -r true 2>/dev/null; then
    asroot="unshare -r"
else
    echo "SKIP: needs root or unprivileged user namespaces"
    exit 0
fi

failures=0
expect() {
    expected=$1; description=$2; shift 2
    set +e
    "$@" >"$tmp/out" 2>&1
    rc=$?
    set -e
    if [ "$rc" -eq "$expected" ]; then
        echo "ok:   $description"
    else
        echo "FAIL: $description (exit $rc, expected $expected)"; sed 's/^/      /' "$tmp/out"
        failures=$((failures + 1))
    fi
}
check() {
    if eval "$2"; then echo "ok:   $1"; else echo "FAIL: $1"; failures=$((failures + 1)); fi
}

expect 2 "no arguments are rejected" $asroot "$tmp/helper"
expect 2 "missing value is rejected" $asroot "$tmp/helper" auto-updates
expect 2 "unknown value is rejected" $asroot "$tmp/helper" auto-updates maybe
expect 2 "unknown command is rejected" $asroot "$tmp/helper" rm -rf
expect 2 "extra arguments are rejected" $asroot "$tmp/helper" auto-updates on extra
expect 2 "option-like input is rejected" $asroot "$tmp/helper" --help on
expect 2 "shell metacharacters are rejected" $asroot "$tmp/helper" auto-updates 'on;id'
check "nothing was written by rejected calls" "[ -z \"\$(ls -A '$conf')\" ]"

expect 0 "auto-updates on" $asroot "$tmp/helper" auto-updates on
check "unattended upgrades enabled" "grep -q '^APT::Periodic::Unattended-Upgrade \"1\";\$' '$conf/20auto-upgrades'"
check "package lists refresh enabled" "grep -q '^APT::Periodic::Update-Package-Lists \"1\";\$' '$conf/20auto-upgrades'"
check "file mode is 0644" "[ \"\$(stat -c %a '$conf/20auto-upgrades')\" = 644 ]"
check "no temporary files left behind" "[ \"\$(ls -A '$conf')\" = 20auto-upgrades ]"

expect 0 "auto-updates off" $asroot "$tmp/helper" auto-updates off
check "unattended upgrades disabled" "grep -q '^APT::Periodic::Unattended-Upgrade \"0\";\$' '$conf/20auto-upgrades'"

# A symlink planted at the target must be replaced, never followed.
rm -f "$conf/20auto-upgrades"
echo "precious" > "$tmp/victim"
ln -s "$tmp/victim" "$conf/20auto-upgrades"
expect 0 "replaces a symlinked target" $asroot "$tmp/helper" auto-updates on
check "symlink target untouched" "[ \"\$(cat '$tmp/victim')\" = precious ]"
check "target is now a regular file" "[ -f '$conf/20auto-upgrades' ] && [ ! -L '$conf/20auto-upgrades' ]"

# Without root it must refuse before touching anything.
if [ "$(id -u)" -eq 0 ] && command -v setpriv >/dev/null 2>&1; then
    chmod 0755 "$tmp"
    expect 3 "refuses to run without root" setpriv --reuid=65534 --regid=65534 --clear-groups "$tmp/helper" auto-updates off
elif [ "$(id -u)" -ne 0 ]; then
    expect 3 "refuses to run without root" "$tmp/helper" auto-updates off
fi

# The shipped helper must not read configuration from the environment.
check "helper has no environment overrides" "! grep -E '\\\$\\{?[A-Z_]+:-' '$HELPER'"

if [ "$failures" -ne 0 ]; then
    echo "$failures check(s) failed"
    exit 1
fi
echo "all admin-helper checks passed"
