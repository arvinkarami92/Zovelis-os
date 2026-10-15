# Zovelis OS architecture

Zovelis OS = **Debian 13 "trixie"** (kernel, drivers, firmware, KDE Plasma
6.3, Qt 6.8, all applications) **+ six Zovelis packages + an image recipe**.
Nothing from Debian is rebuilt or patched; every Zovelis change is a
configuration file, a theme, a small program or a script, shipped in a
normal Debian package. That keeps security updates flowing straight from
Debian and keeps the maintenance work small.

## Layers

```
┌───────────────────────────────────────────────────────────────────────┐
│ Zovelis Welcome (Qt Quick)       Calamares + Zovelis installer config  │  first run / install
├───────────────────────────────────────────────────────────────────────┤
│ Zovelis global themes (light/dark), layout, splash, login screen,      │  look and defaults
│ colour schemes, artwork, Plymouth and GRUB themes                      │
├───────────────────────────────────────────────────────────────────────┤
│ KDE Plasma 6 (KWin, plasmashell, Discover, System Settings, apps)     │  Debian packages
├───────────────────────────────────────────────────────────────────────┤
│ zovelis-base: identity, hardening, update policy, Flathub, zram        │  system defaults
├───────────────────────────────────────────────────────────────────────┤
│ Debian 13: systemd, NetworkManager, PipeWire, BlueZ, ufw, AppArmor,    │  Debian packages
│ Flatpak, APT/unattended-upgrades, Linux 6.12 LTS, firmware             │
└───────────────────────────────────────────────────────────────────────┘
```

## Packages

| Package | Contents | Notes |
| --- | --- | --- |
| `zovelis-base` | `/usr/lib/os-release` (Debian's copy kept as `os-release.debian` via `dpkg-divert`), sysctl hardening, journald size limit, zram configuration, GRUB name/os-prober defaults, unattended-upgrades policy, Flathub remote | `ID=zovelis`, `ID_LIKE=debian`, `VERSION_CODENAME=trixie` so Debian tools keep working |
| `zovelis-artwork` | Logo and icons (hicolor), wallpaper with light/dark variants, Plymouth "two-step" theme, GRUB theme (fonts generated from Noto at build time) | Sets the Plymouth theme on first install only |
| `zovelis-desktop-settings` | Global themes `org.zovelis.light.desktop` and `org.zovelis.dark.desktop` (colours, icons, wallpaper, splash, panel layout script), colour schemes, `/etc/xdg` defaults, SDDM theme `zovelis`, default applications | All are *defaults*: users' own choices always win |
| `zovelis-welcome` | First-run and live-session Welcome app (C++/Qt Quick), autostart entry, polkit-guarded helper for the automatic-updates switch | See below |
| `zovelis-desktop` | Metapackage: core desktop as Depends, everyday apps as Recommends (removable one by one) | |
| `calamares-settings-zovelis` | Installer settings, branding and slideshow, boot-loader and cleanup helpers, "Install Zovelis OS" launcher, polkit rule for the live system | Removed from the installed system by the installer |

## Boot and session flow

1. **Firmware → boot menu.** The ISO boots with ISOLINUX (BIOS) or GRUB
   (UEFI, through Debian's Microsoft-signed shim so Secure Boot works). Both
   menus show "Try or Install Zovelis OS" and a safe-graphics entry and start
   automatically after 10 seconds.
2. **Live system.** `live-boot` mounts the compressed image
   (`live/filesystem.squashfs`, zstd) with a RAM overlay; `live-config`
   creates the `zovelis` live user and logs it in automatically. Two
   live-config components from the installer package finish the live
   session: `0086-zovelis-sddm` picks the Plasma session for the automatic
   login (Wayland; X11 with "safe graphics"), and `0087-zovelis-live-session`
   turns off automatic screen locking and the KDE Wallet for the live user
   only (nobody knows that user's password, and the wallet could not be
   opened without one). While the installer is open, `run-calamares` keeps
   the computer from sleeping.
3. **Plymouth** shows the Zovelis splash (navy background, logo, spinner).
4. **SDDM** shows the Zovelis login screen: Plasma's Breeze login screen
   (loaded from its own directory so it always matches the installed Plasma)
   with the Zovelis background and logo. A built-in fallback form keeps
   login possible even if the Breeze screen were missing.
5. **Plasma** starts. On a user's first login `startplasma` sees
   `LookAndFeelPackage=org.zovelis.light.desktop` in `/etc/xdg/kdeglobals`
   and copies that global theme's defaults into `~/.config/kdedefaults`
   (colours, icons, cursor, splash, wallpaper). `plasmashell` runs the
   theme's layout script to create the taskbar.
6. **Zovelis Welcome** autostarts (unless the user turned it off). In the
   live system it offers *Install* or *Keep trying*; on an installed system
   it walks through appearance, security status and apps.

## Installation flow (Calamares)

Pages: Welcome (requirements) → Location (time zone, GeoIP if online) →
Keyboard → Partitions (erase, alongside, replace or manual; optional LUKS
encryption; ext4 by default, btrfs and xfs available; swap file) → Users →
Summary → install → Finished.

Install steps (`settings.conf`), with Zovelis-specific ones in bold:

```
partition, mount, unpackfs (copy the live image), machineid, fstab, locale,
keyboard, localecfg, luksbootkeyfile, users, displaymanager, networkcfg,
hwclock, **zovelisbootloader@prepare**, grubcfg, bootloader, **zovelisbootloader@finish**,
packages (remove live system and installer), plymouthcfg, initramfscfg,
initramfs, **cleanup**, preservefiles (installer log), umount
```

* **zovelisbootloader@prepare** (`prepare-bootloader`) installs
  `grub-efi-amd64` or `grub-pc` from a copy kept in the image, offline, and
  records in debconf where GRUB lives, so future GRUB updates reinstall it
  correctly. (Both packages conflict, so neither can be preinstalled.)
  `zovelisbootloader` is a small Python job module of our own: it reads the
  boot disk from Calamares' global storage, which holds no value at all when
  the user chose "Do not install a boot loader" (a shell-process step would
  stop with "missing variables" there).
* **bootloader** (Calamares) runs `grub-install` with the EFI directory
  `zovelis`; Debian's `grub-install` picks the signed shim/GRUB.
* **zovelisbootloader@finish** (`finish-bootloader`) also installs the
  boot loader in the UEFI fallback path `EFI/BOOT/BOOTX64.EFI` (shim first,
  so it works with Secure Boot too), gives it the `grub.cfg` that Debian's
  signed GRUB looks for next to itself, and checks that a GRUB menu exists.
* **cleanup** (`cleanup-target`) refuses to finish if live-system packages,
  the installer, password-less sudo rules or the medium as APT source are
  left in the new system, and makes sure the firewall is on.

Why the EFI directory must be `zovelis`: GRUB package updates reinstall
GRUB into `EFI/<first word of GRUB_DISTRIBUTOR, lower case>`.
`GRUB_DISTRIBUTOR="Zovelis"` comes from `zovelis-base`; the installer's
`bootloaderEntryName` and `efiBootloaderId` match it (checked by
`tests/check_consistency.py`). Debian's Secure Boot-signed GRUB has
`/EFI/debian` built in as its prefix, but since GRUB 2.12 (Debian 13) it
first reads `grub.cfg` from the directory it was started from, which
`grub-install` fills for `EFI/zovelis` and `finish-bootloader` for
`EFI/BOOT`.

## Software installation and updates

* **Discover** is the Software Center. Its PackageKit backend handles Debian
  packages, its Flatpak backend handles Flathub (preconfigured through
  `/usr/share/flatpak/remotes.d/flathub.flatpakrepo`, key pinned at build
  time), and its fwupd backend offers firmware updates.
* **Automatic security updates**: `unattended-upgrades` installs Debian
  security and point-release fixes daily (APT timers), never reboots on its
  own, removes old kernels, and skips metered connections. The Welcome app
  can turn this off and on (through a polkit-protected helper that accepts
  exactly `auto-updates on|off`).
* **Update notifications**: Discover's notifier tells the user about other
  updates (at most daily) and about pending restarts.
* **Zovelis packages** are updated like any Debian package once they are
  published in a Zovelis APT repository (see MAINTENANCE.md).

## Zovelis Welcome (Qt/QML)

`packages/zovelis-welcome`: C++17 backend (`Backend` QML singleton) and Qt
Quick Controls pages. Design rules: never runs with privileges; programs are
started with argument lists, never through a shell; anything passed on a
command line is validated (allow-list of settings modules, strict AppStream
ID pattern); state is read from the real system files, so the UI always
shows what the system actually does.

Pages (installed system): Welcome → Appearance (light/dark global theme,
three text sizes, accessibility pointers) → Security (firewall, automatic
updates switch, app sandboxing) → Apps (Software Center, popular Flathub
apps) → Done (tips, "show at every login"). Live system: Install or Keep
trying.

## Image build

`scripts/build-packages.sh` builds the six packages with `dpkg-buildpackage`
and checks them with lintian. `scripts/build-iso.sh` runs live-build with
`live-build/auto/config`: Debian trixie + security + updates, `main contrib
non-free-firmware`, with Recommends (Debian's default; build-time APT
preferences in `config/apt/zovelis-keep-out.pref` keep mail, SSH and RPC
servers, cups-browsed, KDE PIM's database server, KDE Connect, KDE's own
welcome wizard, popularity-contest and Debian's artwork (`desktop-base`,
which would switch new users to the Debian wallpaper) out), our packages from
`config/packages.chroot`, hooks that switch the firewall and automatic
updates on, store the GRUB packages for the installer and verify the image,
and Zovelis boot menus. The result is `build/out/zovelis-os-<version>-amd64.iso`
plus its package list and SHA-256 checksum.

ModemManager comes in through NetworkManager's recommendations but is
switched off by the image hook, since few PCs have a mobile-broadband modem.
On those that do: `sudo systemctl enable --now ModemManager`.
