# SPDX-License-Identifier: GPL-3.0-or-later
"""Zovelis OS installer: boot loader helpers around Calamares' own step.

Two instances of this job run in the installer (see settings.conf):

  * action "prepare", before Calamares' *bootloader* module:
    /usr/libexec/zovelis-installer/prepare-bootloader installs grub-efi-amd64
    or grub-pc from the installation medium and records where GRUB lives;
  * action "finish", after it:
    /usr/libexec/zovelis-installer/finish-bootloader adds the UEFI fallback
    copy (with Secure Boot shim) and checks the result.

A Python job instead of a *contextualprocess* one, because the helpers need
the disk chosen for the boot loader, and when the user picks "Do not install
a boot loader" Calamares stores no value at all: a ${gs[...]} reference to
it would stop the installation with "missing variables".
"""

import subprocess

import libcalamares

HELPERS = {
    "prepare": "/usr/libexec/zovelis-installer/prepare-bootloader",
    "finish": "/usr/libexec/zovelis-installer/finish-bootloader",
}
TIMEOUT_SECONDS = 900


def pretty_name():
    if libcalamares.job.configuration.get("action") == "finish":
        return "Checking the boot loader."
    return "Preparing the boot loader."


def helper_command(action, globalstorage):
    """Command line for the helper of *action*, from the global storage.

    Raises ValueError when the configuration or the global storage lacks
    something the helpers need.
    """
    helper = HELPERS.get(action)
    if helper is None:
        raise ValueError(f"unknown action {action!r} (expected one of {', '.join(sorted(HELPERS))})")
    root = globalstorage.value("rootMountPoint")
    if not isinstance(root, str) or not root.startswith("/"):
        raise ValueError("the new system is not mounted (no rootMountPoint)")
    if globalstorage.value("firmwareType") == "efi":
        return [helper, "efi", root]
    # BIOS: the disk chosen on the partitioning page; nothing at all when the
    # user chose "Do not install a boot loader".
    boot_loader = globalstorage.value("bootLoader")
    disk = ""
    if isinstance(boot_loader, dict):
        disk = boot_loader.get("installPath") or ""
    if not isinstance(disk, str):
        raise ValueError(f"unexpected boot loader location {disk!r}")
    return [helper, "bios", root, disk]


def run():
    action = libcalamares.job.configuration.get("action")
    try:
        command = helper_command(action, libcalamares.globalstorage)
    except ValueError as error:
        return ("Boot loader configuration error", str(error))

    libcalamares.utils.debug("zovelisbootloader: running " + " ".join(repr(a) for a in command))
    try:
        result = subprocess.run(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, timeout=TIMEOUT_SECONDS, check=False)
    except subprocess.TimeoutExpired:
        return ("The boot loader could not be set up.",
                f"{command[0]} did not finish within {TIMEOUT_SECONDS // 60} minutes.")
    except OSError as error:
        return ("The boot loader could not be set up.", f"{command[0]} could not be started: {error}")

    output = result.stdout.decode("utf-8", errors="replace").splitlines()
    for line in output:
        libcalamares.utils.debug("zovelisbootloader: " + line)
    if result.returncode != 0:
        details = "\n".join(output[-15:]) or "(no output)"
        return ("The boot loader could not be set up.",
                f"{command[0]} failed (exit status {result.returncode}):\n{details}")
    return None
