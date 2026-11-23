import { spawn, spawnSync } from 'node:child_process';
import { win32 } from 'node:path';
import { fileURLToPath } from 'node:url';

const usage = 'Usage: node bin/wsl-connector.mjs --distro NAME [--cwd /linux/path | --windows-cwd PATH] [--timeout-ms N] -- PROGRAM [ARG ...]';
function main(args) {
  if (args.length === 1 && args[0] === '--help') {
    console.log(usage);
    return;
  }
  if (process.platform !== 'win32') throw new Error('Run this connector on Windows');
  const delimiter = args.indexOf('--');
  if (delimiter < 0 || !args[delimiter + 1]) throw new Error(usage);
  const options = new Map();
  for (let i = 0; i < delimiter; i += 2) {
    const name = args[i];
    const value = args[i + 1];
    if (!['--distro', '--cwd', '--windows-cwd', '--timeout-ms'].includes(name) || options.has(name) || i + 1 >= delimiter || !value) {
      throw new Error(usage);
    }
    options.set(name, value);
  }
  const distro = options.get('--distro');
  if (!distro || distro.startsWith('-')) throw new Error('Select an installed WSL distribution with --distro');
  const timeout = options.get('--timeout-ms');
  if (timeout && (!/^\d+$/.test(timeout) || Number(timeout) < 1 || Number(timeout) > 2147483647)) throw new Error('Invalid timeout');
  const base = ['--distribution', distro];
  function translate(path) {
    const unc = /^\\\\(?:wsl\.localhost|wsl\$)\\([^\\]+)(?:\\(.*))?$/i.exec(path);
    if (unc) {
      if (unc[1].toLowerCase() !== distro.toLowerCase()) throw new Error('Path belongs to a different WSL distribution');
      return '/' + (unc[2] || '').replaceAll('\\', '/');
    }
    if (!win32.isAbsolute(path)) throw new Error('Windows path must be absolute');
    const result = spawnSync('wsl.exe', [...base, '--exec', 'wslpath', '-u', path], { encoding: 'utf8', timeout: 15000 });
    if (result.error || result.status !== 0) throw new Error('WSL path translation failed: ' + (result.error?.message || result.stderr.trim()));
    const translated = result.stdout.replace(/\r?\n$/, '');
    if (!translated.startsWith('/')) throw new Error('WSL returned an invalid Linux path');
    return translated;
  }
  if (options.has('--cwd') && options.has('--windows-cwd')) throw new Error('Choose one working directory option');
  const cwd = options.has('--windows-cwd') ? translate(options.get('--windows-cwd')) : options.get('--cwd') || '/';
  if (!cwd.startsWith('/')) throw new Error('Linux working directory must be absolute');
  const relay = translate(fileURLToPath(new URL('../lib/relay.py', import.meta.url)));
  const child = spawn('wsl.exe', [...base, '--exec', 'python3', relay, cwd, ...args.slice(delimiter + 1)],
    { stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true });
  let stopping = false;
  let timer;
  function frame(kind, data = Buffer.alloc(0)) {
    const header = Buffer.alloc(5);
    header[0] = kind;
    header.writeUInt32BE(data.length, 1);
    return child.stdin.write(Buffer.concat([header, data]));
  }
  function stop() {
    if (stopping) return;
    stopping = true;
    process.stdin.pause();
    frame(2);
    child.stdin.end();
    timer = setTimeout(() => child.kill(), 5000);
    timer.unref();
  }
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  const deadline = timeout ? setTimeout(stop, Number(timeout)) : undefined;
  child.stdin.on('error', error => {
    if (error.code !== 'EPIPE' && error.code !== 'ERR_STREAM_DESTROYED') console.error(error.message);
  });
  child.stdin.on('drain', () => { if (!stopping) process.stdin.resume(); });
  process.stdin.on('data', data => { if (!stopping && !frame(0, data)) process.stdin.pause(); });
  process.stdin.on('end', () => { if (!stopping) frame(1); });
  process.stdin.on('error', stop);
  child.on('error', error => console.error('WSL launch failed: ' + error.message));
  child.on('close', code => {
    clearTimeout(timer);
    clearTimeout(deadline);
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    process.stdin.pause();
    child.stdin.destroy();
    process.exitCode = stopping ? 130 : code ?? 1;
  });
}

try { main(process.argv.slice(2)); }
catch (error) { console.error(error.message); process.exitCode = 1; }
