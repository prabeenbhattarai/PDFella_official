"""Pluggable malware scanning. Uses clamd when CLAMD_HOST is set; otherwise a no-op."""
import os
import socket
import struct

from .errors import JobError


def scan_file(path: str) -> None:
    host = os.environ.get("CLAMD_HOST")
    if not host:
        return
    port = int(os.environ.get("CLAMD_PORT", "3310"))
    with socket.create_connection((host, port), timeout=30) as s, open(path, "rb") as f:
        s.sendall(b"zINSTREAM\0")
        while chunk := f.read(64 * 1024):
            s.sendall(struct.pack("!L", len(chunk)) + chunk)
        s.sendall(struct.pack("!L", 0))
        reply = s.recv(4096).decode(errors="replace")
    if "FOUND" in reply:
        raise JobError("malware")
    if "OK" not in reply:
        raise JobError("failed", "scanner error")
