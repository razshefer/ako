"""Tiny static server for Reps.

    python serve.py            # http://localhost:8080
    python serve.py 9000       # pick a port

Binds all interfaces and prints a LAN URL so you can open it on your phone
while both devices are on the same Wi-Fi. No dependencies, no build step.
"""
import http.server
import socket
import socketserver
import sys
from functools import partial
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".json": "application/json",
        ".webmanifest": "application/manifest+json",
        ".svg": "image/svg+xml",
    }

    def end_headers(self):
        # always serve fresh files while developing
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("Service-Worker-Allowed", "/")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "304" not in fmt % args:
            sys.stderr.write("  %s\n" % (fmt % args))


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    handler = partial(Handler, directory=str(ROOT))
    with socketserver.ThreadingTCPServer(("0.0.0.0", PORT), handler) as httpd:
        print(f"\n  Reps is serving {ROOT}\n")
        print(f"    this machine : http://localhost:{PORT}/")
        print(f"    your phone   : http://{lan_ip()}:{PORT}/\n")
        print("  Ctrl+C to stop.\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n  stopped.")
