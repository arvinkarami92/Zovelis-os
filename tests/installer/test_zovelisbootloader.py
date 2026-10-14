#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Tests for the zovelisbootloader Calamares job module.

The module runs inside Calamares, which provides the `libcalamares` Python
module; a small stand-in replaces it here. Checked: the helper command line
for UEFI, for BIOS with a boot disk, and for BIOS with "Do not install a boot
loader" (Calamares then stores no value at all), configuration errors, and
how helper failures are reported.
"""
from __future__ import annotations

import importlib.util
import os
import sys
import tempfile
import types
from pathlib import Path

MODULE = (Path(__file__).resolve().parents[2] / "packages/calamares-settings-zovelis/calamares/"
          "zovelis-modules/zovelisbootloader/main.py")

failures = 0


def check(condition: bool, message: str) -> None:
    global failures
    if condition:
        print(f"ok:   {message}")
    else:
        print(f"FAIL: {message}")
        failures += 1


class GlobalStorage:
    """The part of Calamares' GlobalStorage the module uses."""

    def __init__(self, data: dict):
        self.data = data

    def value(self, key: str):
        return self.data.get(key)


def load(configuration: dict, storage: dict):
    """Import main.py with a fresh libcalamares stand-in; returns (module, log)."""
    log: list[str] = []
    fake = types.ModuleType("libcalamares")
    fake.job = types.SimpleNamespace(configuration=configuration)
    fake.globalstorage = GlobalStorage(storage)
    fake.utils = types.SimpleNamespace(debug=log.append, warning=log.append)
    sys.modules["libcalamares"] = fake
    spec = importlib.util.spec_from_file_location("zovelisbootloader", MODULE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module, log


ROOT = "/tmp/calamares-root-abc123"
PREPARE = "/usr/libexec/zovelis-installer/prepare-bootloader"
FINISH = "/usr/libexec/zovelis-installer/finish-bootloader"

# --- Command lines -------------------------------------------------------------
module, _ = load({"action": "prepare"}, {})
cases = [
    ("UEFI", "prepare", {"rootMountPoint": ROOT, "firmwareType": "efi", "bootLoader": None},
     [PREPARE, "efi", ROOT]),
    ("UEFI ignores a BIOS disk", "finish",
     {"rootMountPoint": ROOT, "firmwareType": "efi", "bootLoader": {"installPath": "/dev/sda"}},
     [FINISH, "efi", ROOT]),
    ("BIOS with a boot disk", "prepare",
     {"rootMountPoint": ROOT, "firmwareType": "bios", "bootLoader": {"installPath": "/dev/sda"}},
     [PREPARE, "bios", ROOT, "/dev/sda"]),
    ("BIOS, 'Do not install a boot loader' (no value stored)", "prepare",
     {"rootMountPoint": ROOT, "firmwareType": "bios", "bootLoader": None},
     [PREPARE, "bios", ROOT, ""]),
    ("BIOS, empty boot loader map", "finish",
     {"rootMountPoint": ROOT, "firmwareType": "bios", "bootLoader": {}},
     [FINISH, "bios", ROOT, ""]),
    ("BIOS, empty install path", "finish",
     {"rootMountPoint": ROOT, "firmwareType": "bios", "bootLoader": {"installPath": None}},
     [FINISH, "bios", ROOT, ""]),
]
for description, action, storage, expected in cases:
    try:
        got = module.helper_command(action, GlobalStorage(storage))
    except ValueError as error:
        got = f"ValueError: {error}"
    check(got == expected, f"{description}: {got}")

for description, action, storage in [
    ("unknown action", "reboot", {"rootMountPoint": ROOT, "firmwareType": "efi"}),
    ("no action", None, {"rootMountPoint": ROOT, "firmwareType": "efi"}),
    ("target not mounted", "prepare", {"firmwareType": "efi"}),
    ("relative target", "prepare", {"rootMountPoint": "tmp/x", "firmwareType": "efi"}),
    ("odd boot disk value", "prepare",
     {"rootMountPoint": ROOT, "firmwareType": "bios", "bootLoader": {"installPath": 7}}),
]:
    try:
        module.helper_command(action, GlobalStorage(storage))
        check(False, f"{description} is refused")
    except ValueError:
        check(True, f"{description} is refused")

# --- run(): results and error reports ---------------------------------------------
with tempfile.TemporaryDirectory() as tmp:
    record = Path(tmp) / "args"
    ok_helper = Path(tmp) / "ok-helper"
    ok_helper.write_text(f"#!/bin/sh\nprintf '%s\\n' \"$@\" > '{record}'\necho prepared\n")
    bad_helper = Path(tmp) / "bad-helper"
    bad_helper.write_text("#!/bin/sh\necho 'prepare-bootloader: ERROR: /dev/sdz is not a block device' >&2\nexit 3\n")
    for helper in (ok_helper, bad_helper):
        os.chmod(helper, 0o755)

    storage = {"rootMountPoint": ROOT, "firmwareType": "bios", "bootLoader": None}
    module, log = load({"action": "prepare"}, storage)
    check(module.pretty_name() == "Preparing the boot loader.", "job name for 'prepare'")
    module.HELPERS["prepare"] = str(ok_helper)
    result = module.run()
    check(result is None, f"success is reported as success ({result!r})")
    check(record.read_text().splitlines() == ["bios", ROOT, ""],
          "the helper gets an empty boot disk argument when there is no boot loader")
    check(any("prepared" in line for line in log), "the helper's output goes to the installer log")

    module, log = load({"action": "finish"}, storage)
    check(module.pretty_name() == "Checking the boot loader.", "job name for 'finish'")
    module.HELPERS["finish"] = str(bad_helper)
    result = module.run()
    check(isinstance(result, tuple) and len(result) == 2 and "exit status 3" in result[1]
          and "not a block device" in result[1], f"a failing helper stops the installation with its message ({result!r})")

    module, _ = load({"action": "finish"}, storage)
    module.HELPERS["finish"] = str(Path(tmp) / "missing-helper")
    result = module.run()
    check(isinstance(result, tuple) and "could not be started" in result[1], "a missing helper is reported")

    module, _ = load({"action": "explode"}, storage)
    result = module.run()
    check(isinstance(result, tuple) and "unknown action" in result[1], "a bad configuration is reported")

if failures:
    print(f"{failures} zovelisbootloader check(s) failed")
    sys.exit(1)
print("all zovelisbootloader checks passed")
