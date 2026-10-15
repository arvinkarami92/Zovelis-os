#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Tests for tests/vm/vmctl.py against a stand-in for QEMU.

A small server plays QEMU's monitor (QMP) and the guest agent (QGA) on Unix
sockets, the way vmctl.py finds them in build/vm/<name>/. Checked: the QMP
handshake and asynchronous events, screenshots, keyboard and mouse events,
the guest agent's resynchronisation (0xFF framing), running a command with
standard input and output, and a clean shutdown through the guest agent
instead of the virtual power button.
"""
from __future__ import annotations

import base64
import json
import os
import socket
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

VMCTL = Path(__file__).resolve().with_name("vmctl.py")
failures = 0


def check(condition: bool, message: str) -> None:
    global failures
    print(("ok:   " if condition else "FAIL: ") + message)
    if not condition:
        failures += 1


class FakeQemu:
    """QMP and QGA servers that record every request."""

    def __init__(self, directory: Path):
        self.qmp_log: list[dict] = []
        self.qga_log: list[dict] = []
        self.exec_polls = 0
        self.servers = []
        for name, handler in (("qmp.sock", self.serve_qmp), ("qga.sock", self.serve_qga)):
            server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            server.bind(str(directory / name))
            server.listen(4)
            self.servers.append(server)
            threading.Thread(target=self.accept_loop, args=(server, handler), daemon=True).start()

    def accept_loop(self, server, handler):
        while True:
            try:
                conn, _ = server.accept()
            except OSError:
                return
            with conn:
                try:
                    handler(conn)
                except (OSError, ValueError):
                    pass

    @staticmethod
    def lines(conn):
        buffer = b""
        while True:
            chunk = conn.recv(65536)
            if not chunk:
                return
            buffer += chunk
            while b"\n" in buffer:
                line, buffer = buffer.split(b"\n", 1)
                yield line

    def serve_qmp(self, conn):
        conn.sendall(b'{"QMP": {"version": {"qemu": {"major": 8}}, "capabilities": []}}\r\n')
        for line in self.lines(conn):
            request = json.loads(line)
            self.qmp_log.append(request)
            command = request["execute"]
            # An asynchronous event before the reply, as QEMU sends them.
            conn.sendall(b'{"event": "RTC_CHANGE", "data": {"offset": 0}}\r\n')
            if command == "screendump":
                Path(request["arguments"]["filename"]).write_bytes(b"\x89PNG fake")
            if command == "no-such-command":
                conn.sendall(b'{"error": {"class": "CommandNotFound", "desc": "nope"}}\r\n')
            else:
                conn.sendall(b'{"return": {}}\r\n')

    def serve_qga(self, conn):
        for line in self.lines(conn):
            line = line.lstrip(b"\xff").strip()
            if not line:
                continue
            request = json.loads(line)
            self.qga_log.append(request)
            command = request["execute"]
            arguments = request.get("arguments", {})
            if command == "guest-sync-delimited":
                # A stale reply from an earlier client comes first.
                conn.sendall(b'\xff{"return": 1}\n')
                conn.sendall(b"\xff" + json.dumps({"return": arguments["id"]}).encode() + b"\n")
            elif command == "guest-ping":
                conn.sendall(b'{"return": {}}\n')
            elif command == "guest-exec":
                conn.sendall(b'{"return": {"pid": 4242}}\n')
            elif command == "guest-exec-status":
                self.exec_polls += 1
                if self.exec_polls < 2:
                    conn.sendall(b'{"return": {"exited": false}}\n')
                else:
                    reply = {"exited": True, "exitcode": 3,
                             "out-data": base64.b64encode(b"ok: inside the VM\n").decode(),
                             "err-data": base64.b64encode(b"a warning\n").decode()}
                    conn.sendall(json.dumps({"return": reply}).encode() + b"\n")
            elif command == "guest-shutdown":
                return  # no reply; the guest goes away
            else:
                conn.sendall(b'{"error": {"class": "GenericError", "desc": "unknown"}}\n')

    def close(self):
        for server in self.servers:
            server.close()


def vmctl(state: Path, *args, stdin: bytes | None = None, timeout: float = 60):
    env = dict(os.environ, ZOVELIS_VM_DIR=str(state))
    return subprocess.run([sys.executable, str(VMCTL), *args], input=stdin, capture_output=True,
                          env=env, timeout=timeout)


with tempfile.TemporaryDirectory() as tmp:
    state = Path(tmp) / "vm"
    vm = state / "test"
    vm.mkdir(parents=True)
    fake = FakeQemu(vm)

    result = vmctl(state, "screenshot", "--name", "test", str(Path(tmp) / "shots" / "one.png"))
    check(result.returncode == 0 and (Path(tmp) / "shots" / "one.png").read_bytes().startswith(b"\x89PNG"),
          f"screenshot through QMP ({result.stderr.decode().strip()})")
    check(fake.qmp_log[:2] == [{"execute": "qmp_capabilities"},
                               {"execute": "screendump",
                                "arguments": {"filename": str(Path(tmp) / "shots" / "one.png"), "format": "png"}}],
          "QMP handshake, then screendump (events before replies are skipped)")

    fake.qmp_log.clear()
    result = vmctl(state, "type", "--name", "test", "Hi!")
    keys = [e["data"]["key"]["data"] for r in fake.qmp_log if r["execute"] == "input-send-event"
            for e in r["arguments"]["events"] if e["data"]["down"]]
    check(result.returncode == 0 and keys == ["shift", "h", "i", "shift", "1"], f"typing 'Hi!' presses {keys}")

    fake.qmp_log.clear()
    result = vmctl(state, "key", "--name", "test", "--delay", "0", "ctrl-alt-t")
    events = [r["arguments"]["events"] for r in fake.qmp_log if r["execute"] == "input-send-event"]
    check(result.returncode == 0 and [e["data"]["key"]["data"] for e in events[0]] == ["ctrl", "alt", "t"]
          and [e["data"]["key"]["data"] for e in events[1]] == ["t", "alt", "ctrl"],
          "key combination pressed in order and released in reverse")

    fake.qmp_log.clear()
    result = vmctl(state, "click", "--name", "test", "640", "400")
    sent = [e for r in fake.qmp_log if r["execute"] == "input-send-event" for e in r["arguments"]["events"]]
    axes = [e["data"] for e in sent if e["type"] == "abs"]
    buttons = [e["data"] for e in sent if e["type"] == "btn"]
    check(result.returncode == 0 and axes[0]["value"] == int(640 * 0x7FFF / 1279)
          and buttons == [{"down": True, "button": "left"}, {"down": False, "button": "left"}],
          "click moves the absolute pointer and presses the left button once")

    result = vmctl(state, "exec", "--name", "test", "--stdin", "--", "/bin/sh", "-s", "live",
                   stdin=b"echo hello\n")
    sent = [r for r in fake.qga_log if r["execute"] == "guest-exec"]
    check(result.returncode == 3 and result.stdout == b"ok: inside the VM\n" and result.stderr == b"a warning\n",
          f"exec returns the command's status and output (status {result.returncode})")
    check(len(sent) == 1 and sent[0]["arguments"] == {
        "path": "/bin/sh", "arg": ["-s", "live"], "capture-output": True,
        "input-data": base64.b64encode(b"echo hello\n").decode()},
        "exec passes the command line (without '--') and standard input")

    result = vmctl(state, "wait-agent", "--name", "test", "--timeout", "30")
    check(result.returncode == 1, "wait-agent notices that the VM is not running")

    # A running "VM": stop must use the guest agent, not the power button.
    sleeper = subprocess.Popen(["sleep", "60"])
    (vm / "qemu.pid").write_text(str(sleeper.pid))
    result = vmctl(state, "wait-agent", "--name", "test", "--timeout", "30")
    check(result.returncode == 0, "wait-agent: the guest agent answers")
    fake.qmp_log.clear()
    started = time.time()
    # The guest powers off a second later. (Reaped right away: a zombie would
    # still look alive. QEMU itself is reaped by init, since vmctl.py start
    # has exited by then.)
    threading.Timer(1.0, lambda: (sleeper.terminate(), sleeper.wait())).start()
    result = vmctl(state, "stop", "--name", "test", "--timeout", "20")
    sleeper.wait()
    check(result.returncode == 0 and any(r["execute"] == "guest-shutdown" for r in fake.qga_log),
          "stop asks the guest agent for a clean shutdown")
    check(not any(r["execute"] == "system_powerdown" for r in fake.qmp_log),
          "stop does not press the virtual power button (Plasma would ask what to do)")
    check(time.time() - started < 15, "stop returns once the VM is gone")

    sleeper = subprocess.Popen(["sleep", "60"])
    (vm / "qemu.pid").write_text(str(sleeper.pid))
    fake.qga_log.clear()
    result = vmctl(state, "stop", "--name", "test", "--force")
    try:
        sleeper.wait(timeout=10)
    except subprocess.TimeoutExpired:
        sleeper.kill()
    check(any(r["execute"] == "quit" for r in fake.qmp_log) and not fake.qga_log
          and sleeper.returncode is not None, "stop --force quits QEMU at once")
    fake.close()

if failures:
    print(f"{failures} vmctl check(s) failed")
    sys.exit(1)
print("all vmctl checks passed")
