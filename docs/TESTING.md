# Testing Zovelis OS

Three levels: static checks (no ISO needed), automated VM tests of the live
system, and an installation test (automated checks, manual clicks).

## 1. Static checks and unit tests

```sh
./tests/run-static-checks.sh
```

| Check | What it catches |
| --- | --- |
| shell syntax, shellcheck | errors in the build hooks, installer helpers, maintainer scripts |
| JSON/YAML, installer schemas | broken configuration (validated against Calamares' own schemas) |
| installer YAML as Calamares reads it | values whose meaning changes in Calamares, which types every value by its text: a quoted `"1.0"` becomes the number 1, `yes`/`no` stay text (`tests/installer/check_calamares_yaml.py`) |
| installer boot loader job | the Python job module that runs the boot loader helpers (UEFI, BIOS, "Do not install a boot loader", helper failures) |
| desktop entries, XML | invalid launchers, polkit policies, AppStream metadata |
| colour contrast | text that fails WCAG 2.x contrast (4.5:1 text, 3:1 indicators) in either theme |
| consistency (`tests/check_consistency.py`) | settings that must agree across packages: boot loader names, installer steps and their order, packages removed vs. packages present, theme ids, required splash images, security defaults, the Flathub key against its pinned fingerprint |
| installer polkit rule | the live-only "no password" rule never applies outside the live system |
| desktop layout script | the taskbar layout run against a stand-in for Plasma's scripting API |
| installer helper scripts | input validation and cleanup rules, on fake target systems |
| build chroot trust chain | the development build-chroot helper runs debootstrap only on a Release file signed by a trusted key, with matching package index and debootstrap package (tested against a fake signed archive) |
| Welcome app | C++ unit tests, the privileged helper's argument handling (including symlink attacks), every page rendered in light and dark, wide and narrow, failing on any QML warning |
| qmllint, renders | installer slideshow, splash screen and login-screen fallback |

Screenshots are written to `build/test-results/screenshots/`.

## 2. Live system in a VM (automated)

```sh
./tests/vm/run-vm-tests.sh build/out/zovelis-os-1.0-amd64.iso bios uefi uefi-secure
```

For each firmware type the script boots the ISO in QEMU, takes a screenshot
every 15 seconds, waits for the QEMU guest agent (included in the image; it
only runs inside QEMU), waits for the desktop, and runs
`tests/vm/guest-checks.sh` inside the VM: system state, desktop processes,
login/boot themes, required apps, NetworkManager/Bluetooth/PipeWire/udisks2,
firewall active and denying incoming connections, AppArmor, automatic
updates, Flathub, sysctl hardening, listening network services, zram, log
size. Results: `build/vm-results/<name>/`.

`tests/vm/vmctl.py` drives a VM by hand: `start`, `screenshot`, `type`,
`key`, `click`, `exec` (a command inside the VM), `stop`.

## 3. Installation (BIOS and UEFI)

```sh
V=tests/vm/vmctl.py
$V start --name install-uefi --firmware uefi --iso build/out/zovelis-os-1.0-amd64.iso --disk build/vm/uefi.qcow2
# ... install with the GUI (screenshots: $V screenshot --name install-uefi out.png) ...
$V stop --name install-uefi
# Same name: the VM keeps the firmware settings (boot entries) the installer wrote.
$V start --name install-uefi --firmware uefi --disk build/vm/uefi.qcow2
$V wait-agent --name install-uefi
$V exec --name install-uefi --stdin -- /bin/sh -s installed < tests/vm/guest-checks.sh
$V stop --name install-uefi
# Firmware that lost its boot entries starts EFI/BOOT/BOOTX64.EFI instead;
# the system must start the same way from there.
$V start --name install-uefi --firmware uefi --disk build/vm/uefi.qcow2 --reset-efivars
$V wait-agent --name install-uefi
```

Repeat with `--firmware uefi-secure` (Secure Boot on) and `--firmware bios`.

The `installed` checks add: live system and installer gone, no password-less
sudo, root locked, administrator in `sudo`, private home directories,
initramfs without live hooks, Zovelis boot menu, installer log permissions,
and for UEFI the shim, the fallback path and its GRUB settings, the firmware
boot entry and the GRUB update settings (for BIOS: the GRUB install device).

Manual checklist for each installation test:

- [ ] Installer starts from the desktop icon and from the Welcome app, without a password prompt
- [ ] Erase-disk install with default settings finishes; the slideshow is shown
- [ ] Encrypted install: GRUB asks for the passphrase once, the system boots
- [ ] "Install alongside" keeps an existing system and lists it in the boot menu
- [ ] After reboot: Zovelis boot menu, splash, login screen; login works
- [ ] UEFI: with the firmware's boot entries reset, the system still starts (fallback path)
- [ ] Welcome app opens; light/dark switch and text sizes apply immediately
- [ ] Wi-Fi/ethernet connects; Firefox opens a web page
- [ ] Discover lists updates; an update installs; a Flathub app installs, starts and is removed
- [ ] USB stick shows up in Dolphin and in the tray, can be ejected
- [ ] Sound plays (test in System Settings > Sound); Bluetooth device pairs
- [ ] A second monitor is detected and can be arranged
- [ ] Firewall shows "On" in Welcome and in System Settings > Firewall
- [ ] Shut down, restart, sleep work from the menu

## Hardware checklist (before physical deployment)

Repeat the installation test on: one recent Intel laptop (Wi-Fi, webcam,
touchpad, sleep), one AMD desktop with a discrete GPU, one older BIOS-only
machine, and one machine with Secure Boot enabled.
