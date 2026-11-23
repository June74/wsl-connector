# WSL Connector

A standalone Windows–WSL connector project. The connector is intended to open projects in a named WSL distribution from a Windows editor and connect that editor to a compatible server running inside the distribution.

This repository currently contains the [connector contract](CONTRACT.md) and native boundary smoke tests. The connector implementation is still pending.

## Run the smoke tests

Requirements: Node.js 22 or later on Windows, a running WSL distribution with Python 3, and this checkout accessible from that distribution.

```powershell
node --test test/boundary.test.mjs
```

The test targets Ubuntu by default. Set `WSL_CONNECTOR_DISTRO` to use another installed distribution. Running on Linux checks the Python fixture and Linux process behavior. Running on Windows also checks transport through `wsl.exe`. These tests do not exercise an editor, server installation, authentication, or PTY behavior.

[MIT License](LICENSE)
