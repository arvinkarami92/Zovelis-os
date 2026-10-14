#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# Download Flathub's remote description (repository URL and signing key) for
# zovelis-base, which installs it in /usr/share/flatpak/remotes.d/ so every
# Zovelis OS system can install sandboxed apps from Flathub out of the box.
#
# The key is pinned: the first download records its fingerprint in
# packages/zovelis-base/flathub.fingerprint (commit that file); later
# downloads must match it, so a changed key never slips in unnoticed.
set -eu
cd "$(dirname "$0")/.."

URL=https://dl.flathub.org/repo/flathub.flatpakrepo
DEST=packages/zovelis-base/files/usr/share/flatpak/remotes.d/flathub.flatpakrepo
PIN=packages/zovelis-base/flathub.fingerprint

if [ -s "$DEST" ] && [ "${1:-}" != "--refresh" ]; then
    echo "fetch-flathub-remote: $DEST already present (use --refresh to download again)"
    exit 0
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM

curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
    --max-time 60 -o "$tmp/flathub.flatpakrepo" "$URL"

python3 - "$tmp/flathub.flatpakrepo" "$tmp/key.gpg" <<'PY'
import base64, configparser, sys
cfg = configparser.ConfigParser(interpolation=None)
cfg.optionxform = str
with open(sys.argv[1], encoding="utf-8") as f:
    cfg.read_file(f)
repo = cfg["Flatpak Repo"]
if repo.get("Url", "").rstrip("/") != "https://dl.flathub.org/repo":
    sys.exit(f"unexpected repository URL: {repo.get('Url')!r}")
key = base64.b64decode(repo["GPGKey"], validate=True)
if len(key) < 100:
    sys.exit("signing key is missing or too short")
open(sys.argv[2], "wb").write(key)
PY

fingerprint=$(gpg --batch --with-colons --show-keys "$tmp/key.gpg" 2>/dev/null | awk -F: '/^fpr:/ {print $10; exit}')
[ -n "$fingerprint" ] || { echo "fetch-flathub-remote: could not read the signing key" >&2; exit 1; }

if [ -s "$PIN" ]; then
    if [ "$(cat "$PIN")" != "$fingerprint" ]; then
        echo "fetch-flathub-remote: Flathub key fingerprint changed!" >&2
        echo "  pinned:     $(cat "$PIN")" >&2
        echo "  downloaded: $fingerprint" >&2
        echo "Check https://flathub.org before updating $PIN." >&2
        exit 1
    fi
else
    echo "$fingerprint" > "$PIN"
    echo "fetch-flathub-remote: pinned Flathub key $fingerprint in $PIN"
fi

mkdir -p "$(dirname "$DEST")"
cp "$tmp/flathub.flatpakrepo" "$DEST"
chmod 0644 "$DEST"
echo "fetch-flathub-remote: wrote $DEST (key $fingerprint)"
