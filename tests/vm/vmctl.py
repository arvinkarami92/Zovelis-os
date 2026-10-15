#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Drive a Zovelis OS virtual machine in QEMU for testing.

The VM runs in the background; each command talks to it through QEMU's
monitor (QMP: screenshots, keyboard, mouse, power) or through the QEMU guest
agent inside Zovelis OS (run commands, read files).

  vmctl.py start --name live-bios --iso zovelis.iso [--disk disk.qcow2]
                 [--firmware bios|uefi|uefi-secure] [--memory 4096] [--cpus 2]
  vmctl.py screenshot --name live-bios out.png
  vmctl.py type --name live-bios "some text"
  vmctl.py key --name live-bios ctrl-alt-t        (combinations with '-')
  vmctl.py click --name live-bios 512 384 [--button left|right] [--double]
  vmctl.py exec --name live-bios -- systemctl is-system-running
  vmctl.py wait-agent --name live-bios [--timeout 1800]
  vmctl.py stop --name live-bios [--force]

State (sockets, logs, firmware variables) lives in build/vm/<name>/.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
STATE = Path(os.environ.get("ZOVELIS_VM_DIR", REPO / "build" / "vm"))

OVMF_CANDIDATES = {
    "uefi": [("/usr/share/OVMF/OVMF_CODE_4M.fd", "/usr/share/OVMF/OVMF_VARS_4M.fd")],
    "uefi-secure": [("/usr/share/OVMF/OVMF_CODE_4M.ms.fd", "/usr/share/OVMF/OVMF_VARS_4M.ms.fd"),
                    ("/usr/share/OVMF/OVMF_CODE_4M.secboot.fd", "/usr/share/OVMF/OVMF_VARS_4M.ms.fd")],
}


# --------------------------------------------------------------------------
# QMP (QEMU monitor) and QGA (guest agent) clients
# --------------------------------------------------------------------------
class JsonSocket:
    def __init__(self, path: Path, timeout: float):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(timeout)
        self.sock.connect(str(path))
        self.buf = b""

    def send(self, obj: dict) -> None:
        self.sock.sendall(json.dumps(obj).encode() + b"\n")

    def recv(self) -> dict:
        while b"\n" not in self.buf:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise ConnectionError("connection closed")
            self.buf += chunk
        line, self.buf = self.buf.split(b"\n", 1)
        line = line.strip().lstrip(b"\xff")
        return json.loads(line) if line else self.recv()

    def close(self) -> None:
        self.sock.close()


class QMP:
    def __init__(self, path: Path, timeout: float = 30):
        self.conn = JsonSocket(path, timeout)
        greeting = self.conn.recv()
        if "QMP" not in greeting:
            raise RuntimeError(f"unexpected QMP greeting: {greeting}")
        self.execute("qmp_capabilities")

    def execute(self, command: str, **arguments):
        message = {"execute": command}
        if arguments:
            message["arguments"] = arguments
        self.conn.send(message)
        while True:
            reply = self.conn.recv()
            if "event" in reply:
                continue
            if "error" in reply:
                raise RuntimeError(f"QMP {command}: {reply['error']}")
            return reply.get("return")

    def close(self) -> None:
        self.conn.close()


class QGA:
    """QEMU guest agent client (runs commands inside the VM as root)."""

    def __init__(self, path: Path, timeout: float = 10):
        self.conn = JsonSocket(path, timeout)
        token = int(time.time() * 1000) % 2_000_000_000
        # Discard anything left over from an earlier, interrupted client.
        self.conn.sock.sendall(b"\xff")
        self.conn.send({"execute": "guest-sync-delimited", "arguments": {"id": token}})
        while True:
            reply = self.conn.recv()
            if reply.get("return") == token:
                break

    def execute(self, command: str, **arguments):
        message = {"execute": command}
        if arguments:
            message["arguments"] = arguments
        self.conn.send(message)
        reply = self.conn.recv()
        if "error" in reply:
            raise RuntimeError(f"QGA {command}: {reply['error']}")
        return reply.get("return")

    def run(self, argv: list[str], timeout: float = 300, stdin: bytes | None = None) -> tuple[int, str, str]:
        args = {"path": argv[0], "arg": argv[1:], "capture-output": True}
        if stdin is not None:
            args["input-data"] = base64.b64encode(stdin).decode()
        pid = self.execute("guest-exec", **args)["pid"]
        deadline = time.time() + timeout
        while True:
            status = self.execute("guest-exec-status", pid=pid)
            if status.get("exited"):
                out = base64.b64decode(status.get("out-data", "")).decode(errors="replace")
                err = base64.b64decode(status.get("err-data", "")).decode(errors="replace")
                return status.get("exitcode", -1), out, err
            if time.time() > deadline:
                raise TimeoutError(f"command did not finish in {timeout}s: {argv}")
            time.sleep(0.5)

    def close(self) -> None:
        self.conn.close()


# --------------------------------------------------------------------------
# Keyboard
# --------------------------------------------------------------------------
# US layout: character -> (qcode, shift)
KEYMAP: dict[str, tuple[str, bool]] = {}
for c in "abcdefghijklmnopqrstuvwxyz":
    KEYMAP[c] = (c, False)
    KEYMAP[c.upper()] = (c, True)
for c in "0123456789":
    KEYMAP[c] = (c, False)
for c, (code, shift) in {
    " ": ("spc", False), "\n": ("ret", False), "\t": ("tab", False),
    "-": ("minus", False), "_": ("minus", True), "=": ("equal", False), "+": ("equal", True),
    "[": ("bracket_left", False), "{": ("bracket_left", True), "]": ("bracket_right", False),
    "}": ("bracket_right", True), ";": ("semicolon", False), ":": ("semicolon", True),
    "'": ("apostrophe", False), '"': ("apostrophe", True), ",": ("comma", False), "<": ("comma", True),
    ".": ("dot", False), ">": ("dot", True), "/": ("slash", False), "?": ("slash", True),
    "\\": ("backslash", False), "|": ("backslash", True), "`": ("grave_accent", False),
    "~": ("grave_accent", True), "!": ("1", True), "@": ("2", True), "#": ("3", True), "$": ("4", True),
    "%": ("5", True), "^": ("6", True), "&": ("7", True), "*": ("8", True), "(": ("9", True), ")": ("0", True),
}.items():
    KEYMAP[c] = (code, shift)

KEY_ALIASES = {
    "ctrl": "ctrl", "control": "ctrl", "alt": "alt", "shift": "shift", "meta": "meta_l", "super": "meta_l",
    "win": "meta_l", "enter": "ret", "return": "ret", "esc": "esc", "escape": "esc", "tab": "tab",
    "space": "spc", "backspace": "backspace", "delete": "delete", "up": "up", "down": "down",
    "left": "left", "right": "right", "home": "home", "end": "end", "pgup": "pgup", "pgdn": "pgdn",
}


def key_events(qcodes: list[str], down: bool) -> list[dict]:
    return [{"type": "key", "data": {"down": down, "key": {"type": "qcode", "data": q}}} for q in qcodes]


def send_combo(qmp: QMP, combo: str) -> None:
    keys = []
    for part in combo.lower().split("-"):
        if part in KEY_ALIASES:
            keys.append(KEY_ALIASES[part])
        elif part.startswith("f") and part[1:].isdigit():
            keys.append(part)
        elif len(part) == 1 and part in KEYMAP:
            keys.append(KEYMAP[part][0])
        else:
            keys.append(part)  # raw qcode
    qmp.execute("input-send-event", events=key_events(keys, True))
    time.sleep(0.05)
    qmp.execute("input-send-event", events=key_events(list(reversed(keys)), False))
    time.sleep(0.05)


def type_text(qmp: QMP, text: str, delay: float = 0.04) -> None:
    for ch in text:
        if ch not in KEYMAP:
            raise ValueError(f"cannot type {ch!r} (US keyboard layout only)")
        code, shift = KEYMAP[ch]
        keys = (["shift"] if shift else []) + [code]
        qmp.execute("input-send-event", events=key_events(keys, True))
        qmp.execute("input-send-event", events=key_events(list(reversed(keys)), False))
        time.sleep(delay)


# --------------------------------------------------------------------------
# VM life cycle
# --------------------------------------------------------------------------
def vm_dir(name: str) -> Path:
    return STATE / name


def start(args) -> int:
    d = vm_dir(args.name)
    if (d / "qemu.pid").exists() and _alive(d):
        print(f"VM {args.name} is already running", file=sys.stderr)
        return 1
    d.mkdir(parents=True, exist_ok=True)
    for stale in ("qmp.sock", "qga.sock"):
        (d / stale).unlink(missing_ok=True)

    accel = "kvm" if os.access("/dev/kvm", os.R_OK | os.W_OK) else "tcg,thread=multi"
    cmd = [
        "qemu-system-x86_64", "-name", args.name,
        "-machine", "q35" + (",smm=on" if args.firmware == "uefi-secure" else ""),
        "-accel", accel, "-cpu", "host" if accel == "kvm" else "max",
        "-m", str(args.memory), "-smp", str(args.cpus),
        "-display", "none", "-vga", "none", "-device", "virtio-vga,xres=1280,yres=800",
        "-device", "qemu-xhci", "-device", "usb-tablet", "-device", "usb-kbd",
        "-nic", "user,model=virtio-net-pci",
        "-device", "virtio-serial",
        "-chardev", f"socket,path={d / 'qga.sock'},server=on,wait=off,id=qga0",
        "-device", "virtserialport,chardev=qga0,name=org.qemu.guest_agent.0",
        "-qmp", f"unix:{d / 'qmp.sock'},server=on,wait=off",
        "-serial", f"file:{d / 'serial.log'}",
        "-device", "intel-hda", "-device", "hda-output,audiodev=snd", "-audiodev", "none,id=snd",
        "-rtc", "base=utc",
    ]
    if args.firmware in ("uefi", "uefi-secure"):
        code, vars_template = _ovmf(args.firmware)
        vars_copy = d / "efivars.fd"
        if not vars_copy.exists() or args.reset_efivars:
            shutil.copyfile(vars_template, vars_copy)
        if args.firmware == "uefi-secure":
            cmd += ["-global", "driver=cfi.pflash01,property=secure,value=on"]
        cmd += ["-drive", f"if=pflash,format=raw,unit=0,readonly=on,file={code}",
                "-drive", f"if=pflash,format=raw,unit=1,file={vars_copy}"]
    if args.disk:
        disk = Path(args.disk)
        if not disk.exists():
            subprocess.run(["qemu-img", "create", "-f", "qcow2", str(disk), args.disk_size], check=True)
        cmd += ["-drive", f"file={disk},if=none,id=disk0,format=qcow2,discard=unmap",
                "-device", "virtio-blk-pci,drive=disk0,bootindex=2"]
    if args.iso:
        cmd += ["-drive", f"file={args.iso},if=none,id=cd0,media=cdrom,readonly=on",
                "-device", "ide-cd,drive=cd0,bootindex=1"]
    log = open(d / "qemu.log", "w")
    proc = subprocess.Popen(cmd, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    (d / "qemu.pid").write_text(str(proc.pid))
    (d / "command").write_text(" ".join(cmd) + "\n")
    for _ in range(100):
        if (d / "qmp.sock").exists():
            break
        if proc.poll() is not None:
            print((d / "qemu.log").read_text(), file=sys.stderr)
            return 1
        time.sleep(0.1)
    print(f"started {args.name} (pid {proc.pid}, {accel}, {args.firmware})")
    return 0


def _ovmf(kind: str) -> tuple[str, str]:
    for code, vars_ in OVMF_CANDIDATES[kind]:
        if os.path.exists(code) and os.path.exists(vars_):
            return code, vars_
    raise SystemExit(f"OVMF firmware for {kind} not found (install the 'ovmf' package)")


def _alive(d: Path) -> bool:
    try:
        os.kill(int((d / "qemu.pid").read_text()), 0)
        return True
    except (OSError, ValueError):
        return False


def _guest_shutdown(d: Path) -> bool:
    """Ask the guest agent to power the system off cleanly.

    Preferred over the virtual power button: in a Plasma session that button
    opens the logout screen and waits for a click. guest-shutdown sends no
    reply when it works, so only the request is sent.
    """
    try:
        qga = QGA(d / "qga.sock", timeout=5)
        qga.conn.send({"execute": "guest-shutdown", "arguments": {"mode": "powerdown"}})
        qga.close()
        return True
    except Exception:
        return False


def stop(args) -> int:
    d = vm_dir(args.name)
    if not _alive(d):
        print(f"VM {args.name} is not running")
        return 0
    if args.force or not _guest_shutdown(d):
        try:
            qmp = QMP(d / "qmp.sock")
            qmp.execute("quit" if args.force else "system_powerdown")
            qmp.close()
        except Exception as error:  # already gone
            print(f"note: {error}")
    deadline = time.time() + (5 if args.force else args.timeout)
    while time.time() < deadline and _alive(d):
        time.sleep(1)
    if _alive(d):
        os.kill(int((d / "qemu.pid").read_text()), 9)
    print(f"stopped {args.name}")
    return 0


def screenshot(args) -> int:
    d = vm_dir(args.name)
    out = Path(args.output).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    qmp = QMP(d / "qmp.sock")
    qmp.execute("screendump", filename=str(out), format="png")
    qmp.close()
    print(out)
    return 0


def cmd_type(args) -> int:
    qmp = QMP(vm_dir(args.name) / "qmp.sock")
    type_text(qmp, args.text)
    qmp.close()
    return 0


def cmd_key(args) -> int:
    qmp = QMP(vm_dir(args.name) / "qmp.sock")
    for combo in args.combos:
        send_combo(qmp, combo)
        time.sleep(args.delay)
    qmp.close()
    return 0


def cmd_click(args) -> int:
    qmp = QMP(vm_dir(args.name) / "qmp.sock")
    width, height = args.screen
    x = int(args.x * 0x7FFF / max(1, width - 1))
    y = int(args.y * 0x7FFF / max(1, height - 1))
    qmp.execute("input-send-event", events=[
        {"type": "abs", "data": {"axis": "x", "value": x}},
        {"type": "abs", "data": {"axis": "y", "value": y}}])
    time.sleep(0.1)
    for _ in range(2 if args.double else 1):
        for down in (True, False):
            qmp.execute("input-send-event", events=[{"type": "btn", "data": {"down": down, "button": args.button}}])
            time.sleep(0.06)
    qmp.close()
    return 0


def cmd_exec(args) -> int:
    qga = QGA(vm_dir(args.name) / "qga.sock")
    stdin = sys.stdin.buffer.read() if args.stdin else None
    rc, out, err = qga.run(args.command, timeout=args.timeout, stdin=stdin)
    qga.close()
    sys.stdout.write(out)
    sys.stderr.write(err)
    return rc


def wait_agent(args) -> int:
    d = vm_dir(args.name)
    deadline = time.time() + args.timeout
    while time.time() < deadline:
        if not _alive(d):
            print("VM stopped", file=sys.stderr)
            return 1
        try:
            qga = QGA(d / "qga.sock", timeout=5)
            qga.execute("guest-ping")
            qga.close()
            print(f"guest agent of {args.name} answers ({int(args.timeout - (deadline - time.time()))}s)")
            return 0
        except Exception:
            time.sleep(5)
    print("timed out waiting for the guest agent", file=sys.stderr)
    return 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command_name", required=True)

    def named(name, func, help_):
        p = sub.add_parser(name, help=help_)
        p.add_argument("--name", required=True)
        p.set_defaults(func=func)
        return p

    p = named("start", start, "start a VM")
    p.add_argument("--iso")
    p.add_argument("--disk")
    p.add_argument("--disk-size", default="40G")
    p.add_argument("--firmware", choices=["bios", "uefi", "uefi-secure"], default="bios")
    p.add_argument("--memory", type=int, default=4096)
    p.add_argument("--cpus", type=int, default=2)
    p.add_argument("--reset-efivars", action="store_true")
    p = named("stop", stop, "shut a VM down")
    p.add_argument("--force", action="store_true")
    p.add_argument("--timeout", type=int, default=180)
    p = named("screenshot", screenshot, "save the screen as PNG")
    p.add_argument("output")
    p = named("type", cmd_type, "type text (US layout)")
    p.add_argument("text")
    p = named("key", cmd_key, "press key combinations, e.g. ctrl-alt-t ret")
    p.add_argument("combos", nargs="+")
    p.add_argument("--delay", type=float, default=0.3)
    p = named("click", cmd_click, "click at screen coordinates")
    p.add_argument("x", type=int)
    p.add_argument("y", type=int)
    p.add_argument("--button", default="left", choices=["left", "right", "middle"])
    p.add_argument("--double", action="store_true")
    p.add_argument("--screen", type=lambda s: tuple(int(v) for v in s.split("x")), default=(1280, 800))
    p = named("exec", cmd_exec, "run a command in the VM (guest agent)")
    p.add_argument("--timeout", type=int, default=600)
    p.add_argument("--stdin", action="store_true", help="pass our standard input to the command")
    p.add_argument("command", nargs=argparse.REMAINDER)
    p = named("wait-agent", wait_agent, "wait until the guest agent answers")
    p.add_argument("--timeout", type=int, default=1800)

    args = parser.parse_args()
    if getattr(args, "command", None) and args.command and args.command[0] == "--":
        args.command = args.command[1:]
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
