# Zovelis OS security

## Goals

Zovelis OS is for people who do not want to think about security. The
defaults must protect them without asking questions, and must not get in
the way of normal use. Everything here is standard Debian technology,
configured — nothing is home-made cryptography or a custom security
mechanism.

## What is protected, and how

| Threat | Default protection |
| --- | --- |
| Attacks over the network (open ports, worms on public Wi-Fi) | **ufw firewall on**: incoming connections denied, outgoing allowed. No SSH, mail or other servers installed. Only mDNS (for printers) and the local print service listen. ICMP redirects and source routing ignored. |
| Known vulnerabilities in installed software | **Automatic security updates** from Debian Security (daily, `unattended-upgrades`), never rebooting by itself; update notifications for everything else; firmware updates offered through fwupd. |
| A malicious or buggy app | **Flatpak sandboxing** for apps from Flathub (access to files, devices, camera, microphone through permission portals; permissions visible and changeable in System Settings > Applications > Flatpak Permissions). **AppArmor** profiles for system services. |
| Someone else at the computer, theft | **Password login**; the screen locks after inactivity; root account locked, administration only with the user's password (`sudo`, polkit). **Optional full-disk encryption** (LUKS) in the installer. Home directories are private (0700). |
| Local privilege escalation, information leaks | Kernel hardening (`/usr/lib/sysctl.d/60-zovelis-hardening.conf`): kernel pointers hidden, `dmesg` restricted, ptrace limited to child processes, protected links/FIFOs/regular files in shared directories, no setuid core dumps. |
| Tampering with the boot | **Secure Boot** works through Debian's Microsoft-signed shim and signed GRUB/kernel, also on the fallback EFI path. |

## Administrator rights

* The account created in the installer is an administrator (group `sudo`).
  Administrative actions ask for that user's password (sudo, polkit).
* The root account has no password (locked); the installer never offers one.
* The Welcome app runs without privileges. Its one privileged action — the
  automatic security updates switch — goes through `pkexec` and
  `/usr/libexec/zovelis/zovelis-admin-helper`, which accepts exactly
  `auto-updates on|off`, ignores its environment and replaces the
  configuration file atomically (no symlink following).
* The live system's user can start the installer and use `sudo` without a
  password, as on every live system (the person at the keyboard already
  controls the machine). The polkit rule that allows this only applies while
  the system runs from live media (`/run/live/medium`), and the installer
  removes it, the live-system packages and the installer itself from the new
  system; `cleanup-target` stops the installation if any of them, or any
  `NOPASSWD` sudo rule, is left behind.
* The live session's screen lock never asks for a password (it does not
  lock by itself, and Meta+L only blanks the screen), and the KDE Wallet is
  off: the live system holds no personal data, and its user's password is
  not shown anywhere, so a locked screen would only shut people out (for
  example halfway through an installation). This is written into the live
  user's home in the live system's memory only; installed systems lock the
  screen after 5 minutes and when waking from sleep, and keep passwords in
  the wallet, unlocked with the login password.

## Privacy

* No telemetry. KDE's opt-in user feedback stays off unless the user turns
  it on.
* The installer, when online, contacts KDE's GeoIP service
  (`geoip.kde.org`) to suggest a time zone and checks once whether the
  internet can be reached (`networkcheck.kde.org`, `deb.debian.org`) to
  show it on its first page. It never uploads its log (the pastebin feature
  is disabled).
* File search indexes file names only, not document contents.
* The installed system makes no connectivity checks against third-party
  servers (NetworkManager's connectivity check stays off, as in Debian).

## Build-time integrity

* Every package in the image comes from Debian's signed archive; APT checks
  signatures even when the build machine uses a relay or a proxy.
* The Flathub signing key is pinned by fingerprint
  (`packages/zovelis-base/flathub.fingerprint`); a changed key stops the
  build.
* Nothing from the build machine enters the image: no proxy settings, no
  extra certificate authorities, no machine-id or random seed (checked by
  the image hooks).

## Review results (this version)

Reviewed: all shell scripts (shellcheck clean), maintainer scripts, the
Welcome app's command execution and file handling, the polkit policies and
rules, the installer helpers (tested against fake targets for unexpected
input), and the default service list.

Findings fixed during development:

* The Plymouth theme lacked `box.png`, which the two-step plugin requires;
  the boot splash would have silently fallen back to text mode.
* The login-screen theme overrides were written into the Breeze theme's
  directory by a maintainer script (files outside dpkg's control, and
  overwritten by the settings dialog); replaced by a separate `zovelis` SDDM
  theme with a safe fallback login form.
* In dark mode, some controls of the Welcome app used the style's built-in
  light palette outside Plasma (dark text on a dark window); the app now
  passes the system palette to all controls.
* Calamares' default would upload installation logs to a public pastebin on
  request; disabled.
* On UEFI computers that lose their boot entries (several laptops, many
  virtual machines), the fallback boot path would have stopped at a "grub>"
  prompt: Debian's Secure Boot-signed GRUB reads `grub.cfg` from its own
  directory or from `EFI/debian`, and grub-install only writes it to
  `EFI/zovelis`. The installer now gives `EFI/BOOT` the same file.
* An empty password could be accepted if weak passwords were allowed;
  passwords are now required to have at least 6 characters.
* Calamares 3.3.14 means to keep the computer awake during an installation,
  but its request is never sent (an inverted check in its sleep inhibitor):
  a laptop could go to sleep halfway through, and a USB stick does not
  always come back after sleep. `run-calamares` now holds a logind sleep
  lock (`systemd-inhibit`) while the installer is open.

## Known limitations

* The firewall's "On" status in the Welcome app reflects the configuration
  (`/etc/ufw/ufw.conf`), not the live kernel rules.
* Zovelis' own packages are not yet signed by a published Zovelis APT key;
  they are updated by rebuilding the image until a Zovelis repository
  exists (see MAINTENANCE.md).
* Full-disk encryption uses LUKS1 (GRUB 2.12 cannot unlock LUKS2 with
  Argon2); the passphrase is asked once, by GRUB.
