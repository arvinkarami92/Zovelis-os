#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Cross-checks between the parts of Zovelis OS that must agree.

Many settings are spread over several packages (for example the boot loader
name appears in the installer branding, the installer's boot loader
configuration, the GRUB defaults and GRUB's own update logic). A mismatch
does not fail any single package build but breaks the system, so these
checks look at the whole tree.
"""
from __future__ import annotations

import base64
import configparser
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parent.parent
PKG = REPO / "packages"
failures: list[str] = []


def check(condition: bool, message: str) -> None:
    print(("ok:   " if condition else "FAIL: ") + message)
    if not condition:
        failures.append(message)


def shell_assignments(path: Path) -> dict[str, str]:
    values = {}
    for line in path.read_text().splitlines():
        m = re.match(r'^([A-Z_][A-Z0-9_]*)=(.*)$', line.strip())
        if m:
            values[m.group(1)] = m.group(2).strip().strip('"\'')
    return values


def ini(path: Path) -> configparser.ConfigParser:
    parser = configparser.ConfigParser(interpolation=None, strict=False)
    parser.optionxform = str
    parser.read_string(path.read_text())
    return parser


# --- Identity -------------------------------------------------------------
osr = shell_assignments(PKG / "zovelis-base/files/usr/lib/os-release")
check(osr.get("ID") == "zovelis" and osr.get("ID_LIKE") == "debian", "os-release: ID=zovelis, ID_LIKE=debian")
check(osr.get("VERSION_CODENAME") == "trixie", "os-release: VERSION_CODENAME=trixie (Debian tools need it)")
check(osr.get("NAME") == "Zovelis OS", "os-release: NAME is 'Zovelis OS'")

# --- Version: one number everywhere -----------------------------------------
version = osr.get("VERSION_ID", "")
check(bool(re.fullmatch(r"\d+(\.\d+)+", version)), f"os-release: VERSION_ID '{version}' is a version number")
check(osr.get("VERSION") == version and osr.get("PRETTY_NAME") == f"Zovelis OS {version}",
      "os-release: VERSION and PRETTY_NAME carry VERSION_ID")
for script in ("live-build/auto/config", "scripts/build-iso.sh"):
    default = re.search(r"ZOVELIS_VERSION:-([^}]+)\}", (REPO / script).read_text())
    check(default is not None and default.group(1) == version,
          f"{script}: default image version {default.group(1) if default else None!r} is the os-release version")
# The installer shows the version of the system it installs (os-release).
branding_strings = yaml.safe_load(
    (PKG / "calamares-settings-zovelis/calamares/branding/zovelis/branding.desc").read_text())["strings"]
for key in ("version", "shortVersion", "versionedName", "shortVersionedName"):
    check("${VERSION_ID}" in str(branding_strings.get(key, "")), f"installer branding: {key} comes from os-release")
for changelog in sorted(PKG.glob("*/debian/changelog")):
    first = changelog.read_text().splitlines()[0]
    m = re.match(r"^\S+ \(([^)]+)\)", first)
    check(m is not None and (m.group(1) == version or m.group(1).startswith(version + ".")),
          f"{changelog.parent.parent.name}: package version {m.group(1) if m else '?'} belongs to Zovelis OS {version}")

# --- Boot loader name -----------------------------------------------------
grub = shell_assignments(PKG / "zovelis-base/files/etc/default/grub.d/10-zovelis.cfg")
distributor = grub.get("GRUB_DISTRIBUTOR", "")
efi_id_from_distributor = distributor.split(" ")[0].lower()
cal = PKG / "calamares-settings-zovelis/calamares"
bootloader = yaml.safe_load((cal / "modules/bootloader.conf").read_text())
branding = yaml.safe_load((cal / "branding/zovelis/branding.desc").read_text())
check(bootloader.get("efiBootloaderId") == efi_id_from_distributor,
      f"EFI directory '{bootloader.get('efiBootloaderId')}' matches GRUB_DISTRIBUTOR '{distributor}' "
      "(GRUB updates refresh EFI/<first word>)")
check(branding["strings"]["bootloaderEntryName"] == distributor,
      "installer bootloaderEntryName matches GRUB_DISTRIBUTOR")
check(bootloader.get("installEFIFallback") is False,
      "Calamares' own EFI fallback copy is off (finish-bootloader installs it with shim)")
finish_bootloader = (PKG / "calamares-settings-zovelis/scripts/finish-bootloader").read_text()
efi_id = bootloader.get("efiBootloaderId")
check(f"--bootloader-id={efi_id} " in finish_bootloader and f"EFI/{efi_id}/grub.cfg" in finish_bootloader,
      "finish-bootloader uses the same EFI directory and gives EFI/BOOT its grub.cfg "
      "(Debian's signed GRUB looks next to itself, then in EFI/debian)")
check(grub.get("GRUB_DISABLE_OS_PROBER") == "false", "other operating systems are listed in the boot menu")

# --- Installer -------------------------------------------------------------
settings = yaml.safe_load((cal / "settings.conf").read_text())
instances = {f"{i['module']}@{i['id']}": i["config"] for i in settings.get("instances", [])}
for i in settings.get("instances", []):
    check((cal / "modules" / i["config"]).exists(), f"installer instance {i['id']} has config {i['config']}")
exec_steps = [m for step in settings["sequence"] for kind, mods in step.items() if kind == "exec" for m in mods]
needs_conf = {"partition", "mount", "unpackfs", "machineid", "fstab", "users", "displaymanager", "bootloader",
              "packages", "plymouthcfg", "initramfs", "grubcfg", "luksbootkeyfile", "preservefiles", "umount"}
for module in exec_steps:
    if "@" in module:
        check(module in instances, f"installer step {module} is declared in instances")
    elif module in needs_conf:
        check((cal / "modules" / f"{module}.conf").exists(), f"installer step {module} has a configuration")
order = {m: i for i, m in enumerate(exec_steps)}
check(order["packages"] < order["initramfs"], "live packages are removed before the initramfs is rebuilt")
check(order["zovelisbootloader@prepare"] < order["grubcfg"] < order["bootloader"] < order["zovelisbootloader@finish"],
      "boot loader helpers run around the bootloader step (prepare before grubcfg)")
zmodule = PKG / "calamares-settings-zovelis/calamares/zovelis-modules/zovelisbootloader"
zdesc = yaml.safe_load((zmodule / "module.desc").read_text())
check(zdesc.get("name") == "zovelisbootloader" and zdesc.get("interface") == "python"
      and (zmodule / zdesc.get("script", "")).is_file(), "zovelisbootloader module descriptor and script")
check("/usr/share/calamares-settings-zovelis/modules" in settings.get("modules-search", []),
      "Calamares searches the Zovelis module directory")
zinstall = (PKG / "calamares-settings-zovelis/debian/calamares-settings-zovelis.install").read_text()
check("usr/share/calamares-settings-zovelis/modules/zovelisbootloader/" in zinstall,
      "the Zovelis module is installed where Calamares searches")
check(order["unpackfs"] < order["machineid"] < order["users"], "system copied before machine-id and users")
packages_conf = yaml.safe_load((cal / "modules/packages.conf").read_text())
check(packages_conf.get("update_db") is False and packages_conf.get("update_system") is False,
      "installer never needs the internet to remove packages")
removed = [p for op in packages_conf["operations"] for k, v in op.items() if "remove" in k for p in v]
for p in ("calamares", "calamares-settings-zovelis", "live-boot", "live-config", "live-tools"):
    check(p in removed, f"installer removes {p} from the installed system")
users = yaml.safe_load((cal / "modules/users.conf").read_text())
check(users.get("setRootPassword") is False, "root account stays locked")
check(users["passwordRequirements"]["minLength"] >= 6 and users.get("allowWeakPasswords") is False,
      "user password: at least 6 characters, enforced")
check("sudoersGroup" not in users, "no extra sudoers file (Debian's %sudo rule is used)")
groups = [g["name"] if isinstance(g, dict) else g for g in users["defaultGroups"]]
check("sudo" in groups, "first user is an administrator (sudo group)")
check(users["user"].get("home_permissions") == "o700", "home directories are private")
check(branding.get("uploadServer", {}).get("type") == "none", "installer never uploads logs")
welcome = yaml.safe_load((cal / "modules/welcome.conf").read_text())
check("internet" not in welcome["requirements"]["required"], "installing works offline")

# --- Live image vs. installer ---------------------------------------------
lists = REPO / "live-build/config/package-lists"
listed = set()
for f in lists.glob("*.list.chroot"):
    for line in f.read_text().splitlines():
        line = line.split("#", 1)[0].strip()
        if line:
            listed.add(line)
for p in removed:
    if p in ("live-boot-initramfs-tools", "live-config-systemd"):
        continue
    check(p in listed, f"package {p} removed by the installer is in the image")
for package_dir in sorted(PKG.iterdir()):
    control = package_dir / "debian/control"
    if not control.exists():
        continue
    names = re.findall(r"^Package:\s*(\S+)", control.read_text(), re.M)
    for name in names:
        check(name in listed, f"Zovelis package {name} is installed in the image")
for p in ("grub-efi-amd64-signed", "shim-signed", "grub-pc-bin", "grub-efi-amd64-bin", "efibootmgr", "os-prober"):
    check(p in listed, f"boot loader package {p} is in the image")
for p in ("firefox-esr", "dolphin", "konsole", "systemsettings", "plasma-discover", "flatpak", "ufw",
          "unattended-upgrades", "apparmor", "network-manager", "bluez", "pipewire-audio", "udisks2", "orca"):
    check(p in listed, f"required component {p} is in the image")
check("openssh-server" not in listed, "no SSH server in the image")

# --- Desktop look ----------------------------------------------------------
ds = PKG / "zovelis-desktop-settings"
kdeglobals = ini(ds / "etc/xdg/kdeglobals")
lnf = kdeglobals["KDE"]["LookAndFeelPackage"]
for variant in ("light", "dark"):
    meta = json.loads((ds / f"lookandfeel/{variant}/metadata.json").read_text())
    pid = meta["KPlugin"]["Id"]
    check(pid == f"org.zovelis.{variant}.desktop", f"global theme id {pid}")
    install = (ds / "debian/zovelis-desktop-settings.install").read_text()
    check(f"look-and-feel/{pid}/" in install, f"global theme {pid} is installed under its id")
    defaults = (ds / f"lookandfeel/{variant}/defaults").read_text()
    scheme = re.search(r"^ColorScheme=(\S+)", defaults, re.M).group(1)
    check((ds / f"usr/share/color-schemes/{scheme}.colors").exists(), f"{variant} theme colour scheme {scheme} exists")
    image = re.search(r"^\[Wallpaper\]\s*\nImage=(\S+)", defaults, re.M).group(1)
    check((PKG / f"zovelis-artwork/usr/share/wallpapers/{image}/metadata.json").exists(),
          f"{variant} theme wallpaper {image} exists")
    for preview in ("preview.png", "fullscreenpreview.jpg", "splash.png"):
        check((ds / f"lookandfeel/{variant}/previews/{preview}").exists(), f"{variant} theme preview {preview}")
check(lnf == "org.zovelis.light.desktop", "Zovelis Light is the default global theme")
walls = PKG / "zovelis-artwork/usr/share/wallpapers/Zovelis/contents"
check(sorted(p.name for p in (walls / "images").glob("*.jpg")) == sorted(p.name for p in (walls / "images_dark").glob("*.jpg")),
      "wallpaper has a dark variant for every size")
sddm = ini(ds / "sddm-theme/metadata.desktop")["SddmGreeterTheme"]
check(sddm.get("QtVersion") == "6" and sddm.get("MainScript") == "Main.qml", "login theme targets Qt 6 SDDM")
sddm_conf = ini(ds / "etc/sddm.conf.d/10-zovelis.conf")
check(sddm_conf["Theme"]["Current"] == sddm.get("Theme-Id") == "zovelis", "login theme selected by id")
theme_conf = ini(ds / "sddm-theme/theme.conf")["General"]
for key in ("background", "logo"):
    rel = theme_conf[key].replace("/usr/share/", "usr/share/")
    check((PKG / "zovelis-artwork" / rel).exists(), f"login screen {key} file exists in zovelis-artwork")
about = ini(ds / "etc/xdg/kcm-about-distrorc")["General"]
check((PKG / "zovelis-artwork" / about["LogoPath"].lstrip("/")).exists(), "About this System logo exists")

# --- Boot splash -----------------------------------------------------------
ply = PKG / "zovelis-artwork/usr/share/plymouth/themes/zovelis"
plycfg = ini(ply / "zovelis.plymouth")
check(plycfg["Plymouth Theme"]["ModuleName"] == "two-step", "boot splash uses the two-step plugin")
for name in ("lock.png", "box.png", "entry.png", "bullet.png", "watermark.png", "throbber-0001.png"):
    check((ply / name).exists(), f"boot splash image {name} (required by two-step)")

# --- Welcome app ----------------------------------------------------------
helper = (PKG / "zovelis-welcome/helper/zovelis-admin-helper").read_text()
policy = (PKG / "zovelis-welcome/data/org.zovelis.admin-helper.policy").read_text()
check("/usr/libexec/zovelis/zovelis-admin-helper" in policy, "welcome helper path matches its polkit action")
check("auth_admin" in policy and "<allow_any>no</allow_any>" in policy, "welcome helper requires an administrator")
autostart = ini(PKG / "zovelis-welcome/data/org.zovelis.Welcome-autostart.desktop")["Desktop Entry"]
check("--autostart" in autostart["Exec"], "welcome autostart honours the 'show at login' choice")

# --- Installer launcher ---------------------------------------------------
ipolicy = (PKG / "calamares-settings-zovelis/data/org.zovelis.installer.policy").read_text()
check("/usr/libexec/zovelis-installer/run-calamares" in ipolicy, "installer polkit action guards run-calamares")
rules = (PKG / "calamares-settings-zovelis/data/49-zovelis-installer.rules").read_text()
check("/run/live/medium" in rules, "password-less installer start is limited to the live system")

# --- Flathub ----------------------------------------------------------------
# The remote description in the source tree must carry the pinned key.
flathub = PKG / "zovelis-base/files/usr/share/flatpak/remotes.d/flathub.flatpakrepo"
pin = (PKG / "zovelis-base/flathub.fingerprint").read_text().strip()
repo = ini(flathub)["Flatpak Repo"]
check(repo.get("Url", "").rstrip("/") == "https://dl.flathub.org/repo", "Flathub remote points at dl.flathub.org")
check(re.fullmatch(r"[0-9A-F]{40}", pin) is not None, "Flathub key pin is a full fingerprint")
if shutil.which("gpg"):
    with tempfile.TemporaryDirectory() as home:
        keyfile = Path(home) / "key.gpg"
        keyfile.write_bytes(base64.b64decode(repo["GPGKey"], validate=True))
        listing = subprocess.run(["gpg", "--homedir", home, "--batch", "--with-colons", "--show-keys", str(keyfile)],
                                 capture_output=True, text=True, check=False).stdout
    primary = next((line.split(":")[9] for line in listing.splitlines() if line.startswith("fpr:")), "")
    check(primary == pin, f"Flathub remote key matches the pin ({pin})")
else:
    print("skip: gpg not installed, Flathub key not compared with the pin")

if failures:
    print(f"{len(failures)} consistency check(s) failed")
    sys.exit(1)
print("all consistency checks passed")
