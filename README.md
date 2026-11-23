# WSL Connector

A standalone command-line transport for running Linux processes from Windows through WSL. It connects a Windows caller's standard streams to a Linux command or a preinstalled service that speaks over stdio.

## Use

Requires Windows with WSL, an installed distribution with Python 3, and Node.js 22 or later on Windows. Keep the checkout accessible from the selected distribution.

```powershell
node bin/wsl-connector.mjs --distro Ubuntu --cwd /tmp -- /usr/bin/pwd
'hello' | node bin/wsl-connector.mjs --distro Ubuntu -- /usr/bin/cat
node bin/wsl-connector.mjs --distro Ubuntu --windows-cwd 'C:\My Project' -- /usr/bin/pwd
```

Use `--timeout-ms N` to limit command runtime. Ctrl+C requests cancellation. Standard output and error remain separate, and the connector returns the Linux command's exit code. This is a pipe transport. Programs that require a terminal, an editor-specific handshake, or a network listener need a separate integration.

## Test

```powershell
node --test --test-concurrency=1
```

Tests target Ubuntu by default. Set `WSL_CONNECTOR_DISTRO` to select another installed distribution. On Linux, only the boundary fixture tests run.

See the [connector contract](CONTRACT.md) and [MIT license](LICENSE).

For an IDE that uses the Code-OSS remote protocol, see the [minimal Code-OSS resolver example](examples/code-oss/README.md).
