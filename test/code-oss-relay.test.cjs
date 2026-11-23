const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const distro = process.env.WSL_CONNECTOR_DISTRO || 'Ubuntu';
const base = ['--distribution', distro, '--exec', '/usr/bin/python3', '-c'];
const commit = 'a'.repeat(40);
const fixture = `
import json, pathlib, socket, sys, tempfile
with tempfile.TemporaryDirectory(prefix="wsl-connector-test-") as root:
    p = pathlib.Path(root)
    (p / "product.json").write_text(json.dumps({"commit": sys.argv[1]}))
    (p / "token").write_text("b" * 64)
    (p / "token").chmod(0o600)
    with socket.socket(socket.AF_UNIX) as server:
        server.bind(str(p / "sock"))
        server.listen()
        server.settimeout(20)
        print(root, flush=True)
        for _ in range(2):
            with server.accept()[0] as peer:
                data = peer.recv(65536)
                if data.startswith(b"GET /version"):
                    peer.sendall(b"HTTP/1.1 200 OK\\r\\nContent-Length: 40\\r\\n\\r\\n" + sys.argv[1].encode())
                else:
                    peer.sendall(data)
`;

test('Code-OSS resolver checks matching metadata and exchanges bytes over the private Ubuntu socket',
  { skip: process.platform !== 'win32', timeout: 30000 }, async t => {
    const server = spawn('wsl.exe', [...base, fixture, commit], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const exited = once(server, 'close');
    const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wsl-connector-client-'));
    t.after(() => { server.kill(); fs.rmSync(appRoot, { recursive: true, force: true }); });
    const [line] = await once(server.stdout, 'data');
    const root = String(line).trim();
    assert.match(root, /^\/tmp\/wsl-connector-test-[a-z0-9_]+$/);
    const keys = { WSL_CONNECTOR_SERVER_ROOT: root, WSL_CONNECTOR_TOKEN_FILE: root + '/token', WSL_CONNECTOR_SOCKET: root + '/sock' };
    const before = Object.fromEntries(Object.keys(keys).map(key => [key, process.env[key]]));
    Object.assign(process.env, keys);
    t.after(() => {
      for (const [key, value] of Object.entries(before)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    });
    let resolver;
    class EventEmitter {
      handlers = new Set();
      event = callback => { this.handlers.add(callback); return { dispose: () => this.handlers.delete(callback) }; };
      fire(value) { for (const cb of this.handlers) cb(value); }
      dispose() { this.handlers.clear(); }
    }
    const api = {
      env: { appRoot }, EventEmitter,
      ManagedResolvedAuthority: class { constructor(makeConnection, connectionToken) { Object.assign(this, { makeConnection, connectionToken }); } },
      workspace: { registerRemoteAuthorityResolver(prefix, handler) { assert.equal(prefix, 'wsl-connector'); resolver = handler; } },
    };
    const original = Module._load;
    let extension;
    try {
      Module._load = function (id, ...args) { return id === 'vscode' ? api : original.call(this, id, ...args); };
      extension = require('../examples/code-oss/extension.cjs');
    } finally { Module._load = original; }
    t.after(() => extension.deactivate());
    extension.activate({ subscriptions: [] });
    const writeProduct = revision => fs.writeFileSync(path.join(appRoot, 'product.json'), JSON.stringify({ commit: revision }));
    writeProduct('c'.repeat(40));
    await assert.rejects(resolver.resolve('wsl-connector+' + distro), /commit must match/);
    writeProduct(commit);
    const authority = await resolver.resolve('wsl-connector+' + distro);
    assert.equal(authority.connectionToken, 'b'.repeat(64));
    const link = await authority.makeConnection();
    const message = Buffer.from([0, 1, 128, 255]);
    const reply = new Promise((resolve, reject) => {
      link.onDidReceiveMessage(resolve);
      link.onDidClose(error => reject(error || new Error('Relay closed before the response')));
    });
    link.send(message);
    assert.deepEqual(await reply, message);
    link.end();
    assert.deepEqual(await exited, [0, null]);
  });
