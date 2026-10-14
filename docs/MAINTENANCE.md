# Maintaining Zovelis OS

## What needs care over time

| Item | When | What to do |
| --- | --- | --- |
| Debian point releases (13.x) | every ~2 months | Rebuild the ISO; installed systems get the updates automatically. |
| Debian security updates | continuously | Nothing: `unattended-upgrades` installs them on every system. Rebuild the ISO now and then so new installs start current. |
| Zovelis packages | when changed | Bump the version in `debian/changelog` (`dch -i`), rebuild, publish (below). |
| Flathub key | before 14 June 2027, and if Flathub rotates it | The pinned key (`6E5C05D9…4184DD4D907A7CAE`) expires on 2027-06-14 unless Flathub extends it. Run `scripts/fetch-flathub-remote.sh --refresh` once Flathub publishes the extension (same fingerprint, so the pin still matches) and follow Flathub's advice for existing installations. A changed fingerprint stops the script: verify the new key with Flathub, then update `packages/zovelis-base/flathub.fingerprint`. |
| Plasma minor version | next Debian release only | Within Debian 13, Plasma stays 6.3. Re-check the login-screen wrapper, global themes and layout script before moving to Debian 14. |
| Debian 14 "forky" | ~2027 | New `VERSION_CODENAME`/`DEBIAN_CODENAME` in `os-release`, package names in the package lists, `distribution` in `live-build/auto/config`. |

## Publishing Zovelis package updates

Installed systems receive Debian updates directly. For Zovelis' own
packages, publish an APT repository and add it to the image:

1. Create a signing key for the repository (offline, backed up).
2. Publish `build/debs/*.deb` with `reprepro` (or `aptly`) at an HTTPS URL.
3. Add a `deb822` source with `Signed-By:` pointing to the key file, shipped
   in `zovelis-base` (`/usr/share/keyrings/zovelis-archive-keyring.gpg`).
4. Add the repository's origin to `Unattended-Upgrade::Origins-Pattern` in
   `52zovelis-unattended-upgrades` if Zovelis fixes should install
   automatically.

Until then, `zovelis-*` package updates reach users only through new ISOs.

## Releasing an ISO

1. `./tests/run-static-checks.sh`
2. `./scripts/build-in-container.sh` (or the step-by-step build)
3. `./tests/vm/run-vm-tests.sh build/out/*.iso bios uefi uefi-secure`
4. Installation tests from `docs/TESTING.md` (BIOS, UEFI, encrypted)
5. Publish the ISO with its `.sha256` file (and a detached GPG signature).
