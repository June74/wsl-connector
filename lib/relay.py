"""Run one Linux command and own its process group for the session."""
import os
import selectors
import signal
import struct
import subprocess
import sys
import time


def stop_group(process):
    for sig, grace in ((signal.SIGTERM, 0.7), (signal.SIGKILL, 0)):
        try:
            os.killpg(process.pid, sig)
        except ProcessLookupError:
            break
        if grace:
            time.sleep(grace)
    process.wait(timeout=3)


def relay(process):
    pending = bytearray()
    buffer = bytearray()
    end_input = False
    with selectors.DefaultSelector() as selector:
        selector.register(0, selectors.EVENT_READ, 'host')
        os.set_blocking(process.stdin.fileno(), False)
        while process.poll() is None:
            if process.stdin and not process.stdin.closed:
                if pending:
                    if process.stdin.fileno() not in selector.get_map():
                        selector.register(process.stdin, selectors.EVENT_WRITE, 'command')
                elif end_input:
                    process.stdin.close()
            for key, _ in selector.select(timeout=0.1):
                if key.data == 'command':
                    try:
                        count = os.write(key.fd, pending)
                        del pending[:count]
                    except BlockingIOError:
                        continue
                    except BrokenPipeError:
                        pending.clear()
                        end_input = True
                    if not pending:
                        selector.unregister(key.fd)
                    continue
                data = os.read(0, 65536)
                if not data:
                    return 130
                buffer.extend(data)
                while len(buffer) >= 5:
                    kind, size = struct.unpack_from('>BI', buffer)
                    if size > 1048576 or kind not in (0, 1, 2) or (kind != 0 and size):
                        raise ValueError('invalid connector input frame')
                    if len(buffer) < size + 5:
                        break
                    if kind == 2:
                        return 130
                    if kind == 1:
                        end_input = True
                    elif not end_input:
                        pending.extend(buffer[5:5 + size])
                        if len(pending) > 4 * 1048576:
                            raise ValueError('Linux command is not consuming input')
                    del buffer[:size + 5]
    return process.returncode if process.returncode >= 0 else 128 - process.returncode


def main():
    cwd, *command = sys.argv[1:]
    process = subprocess.Popen(command, cwd=cwd, stdin=subprocess.PIPE, start_new_session=True)
    try:
        return relay(process)
    finally:
        stop_group(process)


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        print(f'WSL connector: {error}', file=sys.stderr)
        sys.exit(1)
