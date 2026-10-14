#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Plain-HTTP to HTTPS relay for package mirrors, for restricted build hosts.

Some build machines (CI sandboxes, corporate networks) can only reach the
internet through an HTTPS (CONNECT) proxy whose TLS certificates are signed
by a private CA. APT inside the image being built does not trust that CA,
and it must not: nothing about the build machine may end up in the image.

This relay listens on 127.0.0.1 and serves

    http://127.0.0.1:PORT/<host>/<path>   ->   https://<host>/<path>

using the build machine's proxy settings and CA bundle. Point the chroot
mirrors of the build at it, e.g.

    ZOVELIS_MIRROR=http://127.0.0.1:8099/deb.debian.org/debian/

APT verifies every package against Debian's signed Release files, so the
relay cannot change what gets installed without the build failing. Only the
hosts given with --allow are relayed.

Usage: apt-https-relay.py [--port 8099] --allow deb.debian.org --allow ...
"""
from __future__ import annotations

import argparse
import http.server
import shutil
import socketserver
import sys
import urllib.error
import urllib.request

CHUNK = 1 << 16


class Relay(http.server.BaseHTTPRequestHandler):
    allowed: set[str] = set()
    protocol_version = "HTTP/1.1"

    def _target(self) -> str | None:
        path = self.path
        if path.startswith("http://"):
            # Absolute form (client configured us as an HTTP proxy).
            rest = path[len("http://"):]
        else:
            rest = path.lstrip("/")
        host, _, tail = rest.partition("/")
        if host not in self.allowed:
            return None
        return f"https://{host}/{tail}"

    def _relay(self, head_only: bool) -> None:
        url = self._target()
        if url is None:
            self.send_error(403, "host not allowed")
            return
        headers = {"User-Agent": "zovelis-build-relay/1.0"}
        for name in ("Range", "If-Modified-Since", "If-None-Match"):
            if self.headers.get(name):
                headers[name] = self.headers[name]
        request = urllib.request.Request(url, headers=headers, method="HEAD" if head_only else "GET")
        try:
            response = urllib.request.urlopen(request, timeout=120)
            status = response.status
        except urllib.error.HTTPError as error:
            response = error
            status = error.code
        except Exception as error:  # network problems
            self.send_error(502, f"upstream error: {error}")
            return
        with response:
            self.send_response(status)
            for name in ("Content-Type", "Content-Length", "Last-Modified", "ETag", "Content-Range",
                         "Accept-Ranges", "Date"):
                value = response.headers.get(name)
                if value:
                    self.send_header(name, value)
            if not response.headers.get("Content-Length"):
                self.send_header("Connection", "close")
                self.close_connection = True
            self.end_headers()
            if not head_only and status not in (204, 304):
                shutil.copyfileobj(response, self.wfile, CHUNK)

    def do_GET(self) -> None:  # noqa: N802 (http.server API)
        self._relay(head_only=False)

    def do_HEAD(self) -> None:  # noqa: N802
        self._relay(head_only=True)

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("relay: " + (fmt % args) + "\n")


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--port", type=int, default=8099)
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--allow", action="append", required=True, help="host name that may be relayed")
    args = parser.parse_args()
    Relay.allowed = set(args.allow)
    with Server((args.bind, args.port), Relay) as server:
        sys.stderr.write(f"relay: http://{args.bind}:{args.port}/<host>/... for {sorted(Relay.allowed)}\n")
        server.serve_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main())
