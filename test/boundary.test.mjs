import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const localPath = fileURLToPath(new URL('./boundary_probe.py', import.meta.url));
const windows = process.platform === 'win32';
const distro = process.env.WSL_CONNECTOR_DISTRO || 'Ubuntu';
const distroArgs = ['--distribution', distro];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 20000, ...options });
  if (result.error) throw result.error;
  return result;
}

function probePath() {
  if (!windows) return localPath;
  const unc = /^\\\\(?:wsl\.localhost|wsl\$)\\([^\\]+)\\(.*)$/i.exec(localPath);
  if (unc) {
    assert.equal(unc[1].toLowerCase(), distro.toLowerCase(), 'Checkout and selected WSL distribution differ');
    return '/' + unc[2].replaceAll('\\', '/');
  }
  const result = run('wsl.exe', [...distroArgs, '--exec', 'wslpath', '-u', localPath]);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

const script = probePath();

function probe(args, cwd) {
  return windows
    ? run('wsl.exe', [...distroArgs, ...(cwd ? ['--cd', cwd] : []), '--exec', 'python3', script, ...args])
    : run('python3', [script, ...args], { cwd });
}

function json(result) {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('preserves literal arguments', () => {
  for (const argument of ['with spaces', "apostrophe'quote\"", '$HOME;$(printf marker)&|', '한글-é-🚀', 'line\nbreak']) {
    assert.equal(json(probe(['echo', argument])).argument, argument);
  }
});

test('sets the requested Linux working directory', () => {
  assert.equal(json(probe(['echo', 'cwd-probe'], '/tmp')).cwd, '/tmp');
});

test('preserves stdout, stderr, and exit status', () => {
  const result = probe(['exit']);
  assert.equal(result.status, 37);
  assert.equal(result.stdout.trim(), 'stdout-marker');
  assert.equal(result.stderr.trim(), 'stderr-marker');
});

test('cancels a fixture-owned Linux process group', () => {
  assert.deepEqual(json(probe(['cancel'])), { parentExited: true, childExited: true });
});
