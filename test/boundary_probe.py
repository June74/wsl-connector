"""Disposable Windows–WSL boundary test fixture."""
import json
import os
import signal
import subprocess
import sys
import tempfile
from pathlib import Path

mode = sys.argv[1]
if mode == "echo":
    print(json.dumps({"argument": sys.argv[2], "cwd": os.getcwd()}, ensure_ascii=True))
elif mode == "exit":
    print("stdout-marker")
    print("stderr-marker", file=sys.stderr)
    sys.exit(37)
elif mode == "cancel":
    if os.name != "posix":
        raise RuntimeError("Run this probe inside WSL/Linux")
    with tempfile.TemporaryDirectory(prefix="wsl-boundary-") as temp:
        marker = Path(temp) / "child-exited"
        child = "import signal,time,sys; from pathlib import Path; signal.signal(signal.SIGTERM,lambda *_:(Path(sys.argv[1]).write_text('done'),sys.exit(0))); print('ready',flush=True); time.sleep(10)"
        parent_code = "import subprocess,sys,signal,time; p=subprocess.Popen([sys.executable,'-c',sys.argv[1],sys.argv[2]],stdout=subprocess.PIPE,text=True); p.stdout.readline(); signal.signal(signal.SIGTERM,lambda *_:(p.wait(timeout=3),sys.exit(0))); print('ready',flush=True); time.sleep(10)"
        process = subprocess.Popen([sys.executable, "-c", parent_code, child, str(marker)], start_new_session=True, stdout=subprocess.PIPE, text=True)
        try:
            assert process.stdout.readline().strip() == "ready"
            os.killpg(process.pid, signal.SIGTERM)
            process.wait(timeout=5)
            print(json.dumps({"parentExited": process.returncode == 0, "childExited": marker.exists()}))
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=3)
else:
    raise ValueError(mode)

