import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const cli = fileURLToPath(new URL('../bin/wsl-connector.mjs', import.meta.url));
const distro = process.env.WSL_CONNECTOR_DISTRO || 'Ubuntu';
function run(args, input, target = distro) {
  const result = spawnSync(process.execPath, [cli, '--distro', target, ...args], {
    input, timeout: 30000, maxBuffer: 4 * 1024 * 1024, encoding: 'buffer'
  });
  if (result.error) throw result.error;
  return result;
}
const options = { skip: process.platform !== 'win32' };
test('connects binary stdin and stdout without mixing stderr', options, () => {
  const bytes = Buffer.alloc(1024 * 1024);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
  const result = run(['--', '/usr/bin/python3', '-c',
    "import sys; sys.stdout.buffer.write(sys.stdin.buffer.read()); print('separate', file=sys.stderr); sys.exit(37)"], bytes);
  assert.equal(result.status, 37, String(result.stderr));
  assert.deepEqual(result.stdout, bytes);
  assert.equal(String(result.stderr).trim(), 'separate');
});
test('preserves literal arguments from a translated Windows cwd', options, () => {
  const cwd = fileURLToPath(new URL('..', import.meta.url));
  const args = ['space and \"quote\"', '한글-é-🚀', '$HOME;$(printf marker)', 'line\nbreak'];
  const result = run(['--windows-cwd', cwd, '--', '/usr/bin/python3', '-c',
    "import json,os,sys; print(json.dumps([os.path.isfile('CONTRACT.md'),sys.argv[1:]]))", ...args]);
  assert.equal(result.status, 0, String(result.stderr));
  assert.deepEqual(JSON.parse(result.stdout), [true, args]);
});
test('rejects unavailable distributions and invalid Linux cwd', options, () => {
  assert.notEqual(run(['--', '/usr/bin/true'], undefined, 'wsl-connector-nonexistent-test').status, 0);
  const result = run(['--cwd', '/wsl-connector-nonexistent-cwd', '--', '/usr/bin/true']);
  assert.equal(result.status, 1);
  assert.match(String(result.stderr), /No such file or directory/);
});
test('timeout stops the Linux command and its descendant', options, () => {
  const result = run(['--timeout-ms', '2000', '--', '/usr/bin/python3', '-c',
    "import os,subprocess,time; child=subprocess.Popen(['/usr/bin/sleep','90']); print(os.getpid(),child.pid,flush=True); time.sleep(90)"]);
  assert.equal(result.status, 130, String(result.stderr));
  const pids = String(result.stdout).trim().split(' ');
  assert.equal(pids.length, 2);
  for (const pid of pids) assert.match(pid, /^\d+$/);
  const check = spawnSync('wsl.exe', ['--distribution', distro, '--exec', 'python3', '-c',
    "from pathlib import Path; import sys; sys.exit(any(p.exists() and p.read_text().split(') ')[-1][0] != 'Z' for p in [Path('/proc')/i/'stat' for i in sys.argv[1:]]))", ...pids], { timeout: 5000 });
  assert.equal(check.status, 0, String(check.stderr));
});
