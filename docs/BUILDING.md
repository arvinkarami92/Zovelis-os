# Building Zovelis OS

## Requirements

* A **Debian 13 (trixie)** environment with root access: a physical or
  virtual machine, a container (`--privileged`, because live-build mounts
  `/proc` and friends inside the image chroot) or a chroot.
* About **25 GB** of free disk space and 4 GB of RAM.
* Internet access to `deb.debian.org`, `security.debian.org` and (once, for
  the Flathub key) `dl.flathub.org`.
* Time: about 30–60 minutes on a 4-core machine (package downloads, image
  compression).

## The easy way: a container

```sh
./scripts/build-in-container.sh        # uses podman or docker
```

This starts `debian:trixie`, installs the build tools
(`scripts/setup-build-env.sh`), builds the packages and the ISO. Results:

```
build/debs/                         the six Zovelis .deb packages
build/out/zovelis-os-1.0-amd64.iso  the live/installation image (hybrid: USB and DVD)
build/out/zovelis-os-1.0-amd64.iso.sha256
build/out/zovelis-os-1.0-amd64.packages   every package in the image, with versions
```

## Step by step on Debian 13

```sh
sudo ./scripts/setup-build-env.sh       # live-build, debhelper, Qt 6 dev, QEMU, ...
./scripts/build-packages.sh             # -> build/debs/ (also runs lintian)
sudo ./scripts/build-iso.sh             # -> build/out/
```

`build-packages.sh` first runs `scripts/fetch-flathub-remote.sh`, which
downloads Flathub's remote description and checks its signing key against
the pinned fingerprint in `packages/zovelis-base/flathub.fingerprint` (the
first download creates the pin; commit it).

`build-iso.sh` copies `live-build/` to `build/live/`, adds the packages and
the boot-menu fonts, and runs `lb config` / `lb build`. Hooks inside the
image switch on the firewall and automatic updates, keep the GRUB packages
for the installer, and run a list of checks; the build stops if any check
fails (`live-build/config/hooks/live/9000-zovelis-verify.hook.chroot`).

### Options

| Variable | Default | Purpose |
| --- | --- | --- |
| `ZOVELIS_VERSION` | `1.0` | Version in the ISO name and volume label |
| `ZOVELIS_MIRROR` | `https://deb.debian.org/debian/` | Mirror used while building (the image itself always uses `deb.debian.org`) |
| `ZOVELIS_SECURITY_MIRROR` | `https://security.debian.org/debian-security/` | Security mirror used while building |
| `ZOVELIS_KEEP_CACHE=1` | off | Keep live-build's package cache between builds |

### Building behind a restrictive proxy

If the build machine can only reach the internet through an HTTPS proxy
with its own certificate authority, do **not** add that CA to the image.
Instead run the relay in `scripts/dev/apt-https-relay.py` and point the
build mirrors at it:

```sh
python3 scripts/dev/apt-https-relay.py --allow deb.debian.org --allow security.debian.org &
export ZOVELIS_MIRROR=http://127.0.0.1:8099/deb.debian.org/debian/
export ZOVELIS_SECURITY_MIRROR=http://127.0.0.1:8099/security.debian.org/debian-security/
sudo -E ./scripts/build-iso.sh
```

APT still verifies every package against Debian's signed release files.

### Building on a Linux distribution other than Debian, without containers

`scripts/dev/make-build-chroot.sh` creates a Debian 13 chroot in
`/srv/zovelis-build` and runs the build scripts inside it:

```sh
sudo scripts/dev/make-build-chroot.sh create
sudo scripts/dev/make-build-chroot.sh run ./scripts/build-packages.sh
sudo scripts/dev/make-build-chroot.sh run ./scripts/build-iso.sh
```

It checks Debian's signed `Release` file, the package index and debootstrap
before running anything. The keys come from the host's
`debian-archive-keyring` package, or set `ZOVELIS_DEBIAN_KEYS` to the
fingerprints (40 hex digits, no spaces) of Debian's archive signing keys
published at <https://ftp-master.debian.org/keys.html>. `ZOVELIS_MIRROR` and
`ZOVELIS_SECURITY_MIRROR` work as above.

## Changing things

* **Artwork** is generated from code: edit `branding/generate.py` /
  `branding/mockups.py`, then run `make artwork SVGRENDER=/path/to/svgrender`
  (`branding/tools/` builds `svgrender` against Qt SVG). Colours live in
  `branding/generate_colors.py`, which also checks WCAG contrast.
* **Default applications and packages**: `live-build/config/package-lists/`
  and `packages/zovelis-desktop/debian/control`.
* **Desktop layout**: `packages/zovelis-desktop-settings/lookandfeel/common/layouts/`
  (tested by `tests/plasma/layout-test.js`).
* **Installer**: `packages/calamares-settings-zovelis/calamares/`.

After any change run `./tests/run-static-checks.sh`.
