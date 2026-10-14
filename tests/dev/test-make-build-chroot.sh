#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# Tests the trust chain of scripts/dev/make-build-chroot.sh against a fake
# Debian archive on 127.0.0.1, signed with a throwaway key: debootstrap may
# only run when the Release file is signed by a trusted key and the package
# index and the debootstrap package match it. Needs root (the script under
# test refuses to run otherwise), gpg, dpkg-deb, xz and python3; skipped
# otherwise. Runs in a private mount namespace, so nothing stays mounted.
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
SCRIPT=$HERE/../../scripts/dev/make-build-chroot.sh

for tool in gpg gpgv dpkg-deb xz python3 unshare curl; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        echo "SKIP: $tool not installed"
        exit 0
    fi
done
if [ "$(id -u)" -ne 0 ]; then
    echo "SKIP: needs root"
    exit 0
fi

tmp=$(mktemp -d)
server=
cleanup() {
    [ -z "$server" ] || kill "$server" 2>/dev/null || true
    rm -rf "$tmp"
}
trap cleanup EXIT HUP INT TERM

export GNUPGHOME="$tmp/gnupg"
mkdir -m 0700 "$GNUPGHOME"
gpg --batch --quiet --passphrase '' --quick-gen-key 'Test Archive <archive@example.invalid>' ed25519 sign never 2>/dev/null
gpg --batch --quiet --passphrase '' --quick-gen-key 'Someone Else <other@example.invalid>' ed25519 sign never 2>/dev/null
fpr_of() {
    gpg --batch --with-colons --list-keys "$1" | awk -F: '$1 == "fpr" { print $10; exit }'
}
ARCHIVE_KEY=$(fpr_of archive@example.invalid)
OTHER_KEY=$(fpr_of other@example.invalid)

archive=$tmp/archive
make_deb() {  # make_deb NAME DIR
    mkdir -p "$2/DEBIAN"
    printf 'Package: %s\nVersion: 1\nArchitecture: all\nMaintainer: Test <t@example.invalid>\nDescription: test\n' \
        "$1" > "$2/DEBIAN/control"
    mkdir -p "$archive/pool/main/d/$1"
    dpkg-deb --root-owner-group --build "$2" "$archive/pool/main/d/$1/${1}_1_all.deb" >/dev/null
}

# The keyring package: the archive key, plus another key in a second file
# that must not be trusted unless asked for.
mkdir -p "$tmp/keyring/usr/share/keyrings"
gpg --batch --export "$ARCHIVE_KEY" > "$tmp/keyring/usr/share/keyrings/debian-archive-keyring.gpg"
gpg --batch --export "$OTHER_KEY" > "$tmp/keyring/usr/share/keyrings/debian-archive-removed-keys.gpg"
make_deb debian-archive-keyring "$tmp/keyring"

# debootstrap: records that it ran and with which keys.
make_debootstrap() {
    rm -rf "$tmp/debootstrap"
    mkdir -p "$tmp/debootstrap/usr/sbin" "$tmp/debootstrap/usr/share/debootstrap"
    cat > "$tmp/debootstrap/usr/sbin/debootstrap" <<EOF
#!/bin/sh
# $1
for arg; do target=\$chroot; chroot=\$arg; done
keyring=\${1#--keyring=}
mkdir -p "\$target/etc/apt"
gpg --batch --show-keys --with-colons "\$keyring" | awk -F: '\$1 == "fpr" { print \$10 }' > "\$target/debootstrap-keys"
EOF
    chmod 0755 "$tmp/debootstrap/usr/sbin/debootstrap"
    make_deb debootstrap "$tmp/debootstrap"
}
make_debootstrap original

index() {  # (re)writes the package index and the signed Release file; $1 = signing key
    dir=$archive/dists/trixie/main/binary-all
    mkdir -p "$dir"
    : > "$dir/Packages"
    for deb in "$archive"/pool/main/d/*/*.deb; do
        name=$(dpkg-deb -f "$deb" Package)
        {
            echo "Package: $name"
            echo "Version: 1"
            echo "Architecture: all"
            echo "Filename: ${deb#"$archive"/}"
            echo "Size: $(stat -c %s "$deb")"
            echo "SHA256: $(sha256sum "$deb" | cut -d' ' -f1)"
            echo
        } >> "$dir/Packages"
    done
    xz -kf "$dir/Packages"
    {
        echo "Origin: Test"
        echo "Suite: trixie"
        echo "Codename: trixie"
        echo "SHA256:"
        echo " $(sha256sum "$dir/Packages.xz" | cut -d' ' -f1) $(stat -c %s "$dir/Packages.xz") main/binary-all/Packages.xz"
    } > "$archive/dists/trixie/Release"
    rm -f "$archive/dists/trixie/InRelease"
    gpg --batch --quiet --local-user "$1" --clearsign \
        --output "$archive/dists/trixie/InRelease" "$archive/dists/trixie/Release"
}
index "$ARCHIVE_KEY"

port=$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')
python3 -m http.server --bind 127.0.0.1 --directory "$archive" "$port" >/dev/null 2>&1 &
server=$!
i=0
until curl -fs -o /dev/null "http://127.0.0.1:$port/dists/trixie/Release"; do
    i=$((i + 1))
    [ "$i" -lt 50 ] || { echo "FAIL: test archive server did not start"; exit 1; }
    sleep 0.1
done

# The script under test, in a tree of its own (it writes to build/ there).
tree=$tmp/tree
mkdir -p "$tree/scripts/dev"
cp "$SCRIPT" "$tree/scripts/dev/"

failures=0
# run_create EXPECT DESCRIPTION [VAR=value...]: expect "ran" (debootstrap ran)
# or a message the script must stop with before debootstrap.
run_create() {
    expect=$1
    description=$2
    shift 2
    rm -rf "$tmp/chroot"
    set +e
    env -u GNUPGHOME ZOVELIS_CHROOT="$tmp/chroot" ZOVELIS_MIRROR="http://127.0.0.1:$port" "$@" \
        unshare --mount "$tree/scripts/dev/make-build-chroot.sh" create > "$tmp/out" 2>&1
    set -e
    if [ "$expect" = ran ]; then
        if [ -s "$tmp/chroot/debootstrap-keys" ] &&
            [ "$(cat "$tmp/chroot/debootstrap-keys")" = "$ARCHIVE_KEY" ]; then
            echo "ok:   $description"
            return
        fi
    elif [ ! -e "$tmp/chroot/debootstrap-keys" ] && grep -q "$expect" "$tmp/out"; then
        echo "ok:   $description"
        return
    fi
    echo "FAIL: $description"
    sed 's/^/      /' "$tmp/out"
    failures=$((failures + 1))
}

run_create ran "a correctly signed archive reaches debootstrap, with only the given key" \
    ZOVELIS_DEBIAN_KEYS="$ARCHIVE_KEY"
run_create ran "fingerprints are accepted in lower case" \
    ZOVELIS_DEBIAN_KEYS="$(echo "$ARCHIVE_KEY" | tr 'A-F' 'a-f')"
run_create "not a fingerprint" "a fingerprint with spaces is refused" \
    ZOVELIS_DEBIAN_KEYS="$(echo "$ARCHIVE_KEY" | cut -c1-20) $(echo "$ARCHIVE_KEY" | cut -c21-40)"
run_create "archive key .* not found" "a key missing from the keyring package is refused" \
    ZOVELIS_DEBIAN_KEYS=0123456789ABCDEF0123456789ABCDEF01234567

index "$OTHER_KEY"
run_create "not signed by a trusted Debian key" "a Release file signed by another key is refused" \
    ZOVELIS_DEBIAN_KEYS="$ARCHIVE_KEY"
if [ -s /usr/share/keyrings/debian-archive-keyring.gpg ]; then
    run_create "not signed by a trusted Debian key" "the host's Debian keys do not trust the test key"
else
    run_create "no Debian archive keys" "without keys the script stops"
fi

# An index that points to another debootstrap, under the old signature.
index "$ARCHIVE_KEY"
cp "$archive/dists/trixie/InRelease" "$tmp/InRelease.good"
make_debootstrap substituted
index "$ARCHIVE_KEY"
cp "$tmp/InRelease.good" "$archive/dists/trixie/InRelease"
run_create "package index was modified" "a modified package index is refused" \
    ZOVELIS_DEBIAN_KEYS="$ARCHIVE_KEY"

index "$ARCHIVE_KEY"
make_debootstrap tampered
run_create "debootstrap does not match the archive index" "a modified debootstrap package is refused" \
    ZOVELIS_DEBIAN_KEYS="$ARCHIVE_KEY"

if [ "$failures" -ne 0 ]; then
    echo "$failures build chroot check(s) failed"
    exit 1
fi
echo "all build chroot checks passed"
