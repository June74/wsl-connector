const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');
const vscode = require('vscode');

const exec = promisify(execFile);
const name = 'wsl-connector';
const running = new Set();
const relayPath = path.join(__dirname, 'socket-relay.py');
const wsl = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wsl.exe');

function connect(args) {
  const proc = spawn(wsl, args, { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
  running.add(proc);
  const data = new vscode.EventEmitter();
  const close = new vscode.EventEmitter();
  const end = new vscode.EventEmitter();
  let ready = false;
  let failure;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      failure = new Error('Timed out connecting to the WSL server socket');
      proc.kill();
      reject(failure);
    }, 10000);
    const fail = error => {
      failure ??= error;
      proc.kill();
      reject(failure);
    };
    proc.on('error', fail);
    proc.stdin.on('error', fail);
    proc.stdout.on('error', fail);
    proc.on('close', code => {
      running.delete(proc);
      clearTimeout(timer);
      const error = failure ?? (code === 0 ? undefined : new Error('Unable to connect to the staged WSL server socket (exit ' + code + ')'));
      if (!ready) reject(error ?? new Error('WSL relay closed before readiness'));
      else {
        close.fire(error);
      }
      data.dispose();
      end.dispose();
      close.dispose();
    });
    proc.stdout.on('data', bytes => {
      if (!ready) {
        if (bytes[0] !== 1) return fail(new Error('Invalid WSL relay readiness response'));
        ready = true;
        clearTimeout(timer);
        resolve({
          onDidReceiveMessage: data.event,
          onDidClose: close.event,
          onDidEnd: end.event,
          send(bytes) {
            if (proc.stdin.writableLength + bytes.byteLength > 16 * 1024 * 1024) {
              fail(new Error('WSL relay exceeded its send buffer'));
              return;
            }
            proc.stdin.write(Buffer.from(bytes));
          },
          end() { proc.stdin.end(); },
        });
        bytes = bytes.subarray(1);
        if (bytes.length) queueMicrotask(() => data.fire(bytes));
      } else {
        data.fire(bytes);
      }
    });
  });
}

exports.activate = context => {
  context.subscriptions.push(vscode.workspace.registerRemoteAuthorityResolver(name, {
    async resolve(authority) {
      const distro = process.env.WSL_CONNECTOR_DISTRO || 'Ubuntu';
      if (process.platform !== 'win32' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(distro) || authority !== name + '+' + distro) {
        throw new Error('Select the configured WSL distribution in the remote URI');
      }
      const socket = process.env.WSL_CONNECTOR_SOCKET;
      const tokenFile = process.env.WSL_CONNECTOR_TOKEN_FILE;
      const root = process.env.WSL_CONNECTOR_SERVER_ROOT;
      if (![socket, tokenFile, root].every(p => p && p.startsWith('/'))) {
        throw new Error('Set absolute Linux paths for WSL_CONNECTOR_SOCKET, WSL_CONNECTOR_TOKEN_FILE and WSL_CONNECTOR_SERVER_ROOT');
      }
      const client = JSON.parse(await fs.readFile(path.join(vscode.env.appRoot, 'product.json'), 'utf8'));
      if (!/^[a-f0-9]{40}$/.test(client.commit || '')) throw new Error('A packaged Code-OSS client with a stamped commit is required');
      const base = ['--distribution', distro, '--exec', '/usr/bin/python3'];
      const relaySource = await fs.readFile(relayPath, 'utf8');
      const readConfig = 'import json, os, stat, sys; from pathlib import Path; p = Path(sys.argv[2]); s = p.lstat(); safe = stat.S_ISREG(s.st_mode) and s.st_uid == os.getuid() and not s.st_mode & 63 and s.st_size <= 256; safe or sys.exit(1); print(json.dumps([json.loads((Path(sys.argv[1]) / "product.json").read_text())["commit"], p.read_text().strip()]))';
      // Do not surface subprocess output from the token-read step.
      let config;
      try {
        const result = await exec(wsl, [...base, '-c', readConfig, root, tokenFile], { timeout: 10000, maxBuffer: 4096, windowsHide: true });
        config = JSON.parse(result.stdout);
      } catch {
        throw new Error('Cannot read staged server metadata or private token file in ' + distro);
      }
      const [commit, token] = config;
      if (commit !== client.commit) throw new Error('The staged server commit must match the Windows editor commit');
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(token)) throw new Error('Invalid server token');
      try {
        await exec(wsl, [...base, '-c', relaySource, socket, commit], { timeout: 10000, maxBuffer: 4096, windowsHide: true });
      } catch {
        throw new Error('The private WSL socket is unavailable or its running server revision differs');
      }
      return new vscode.ManagedResolvedAuthority(() => connect([...base, '-c', relaySource, socket]), token);
    }
  }));
};

exports.deactivate = () => {
  for (const proc of running) proc.kill();
};
