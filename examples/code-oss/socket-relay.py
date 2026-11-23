"""Connect a WSL stdio process to an owned editor-server socket."""
import http.client
import os
import selectors
import socket
import stat
import sys
p = sys.argv[1]
parent = os.lstat(os.path.dirname(p))
endpoint = os.lstat(p)
if (not stat.S_ISDIR(parent.st_mode) or parent.st_uid != os.getuid()
    or parent.st_mode & 0o077 or not stat.S_ISSOCK(endpoint.st_mode)
    or endpoint.st_uid != os.getuid()):
    sys.exit("Expected an owned socket in a private directory")
with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as remote:
    remote.settimeout(5)
    remote.connect(p)
    if len(sys.argv) == 3:
        remote.sendall(b"GET /version HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
        response = http.client.HTTPResponse(remote)
        response.begin()
        if response.status != 200 or response.read(41) != sys.argv[2].encode("ascii"):
            sys.exit("Running server revision does not match the editor")
        sys.exit(0)
    remote.settimeout(None)
    os.write(1, b"\x01")
    with selectors.DefaultSelector() as sel:
        sel.register(0, selectors.EVENT_READ)
        sel.register(remote, selectors.EVENT_READ)
        while True:
            for key, _ in sel.select():
                if key.fd == 0:
                    data = os.read(0, 65536)
                    if not data:
                        sys.exit(0)
                    remote.sendall(data)
                else:
                    data = remote.recv(65536)
                    if not data:
                        sys.exit(0)
                    view = memoryview(data)
                    while view:
                        view = view[os.write(1, view):]
