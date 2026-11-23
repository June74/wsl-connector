# Code-OSS integration

This Windows UI extension implements a remote authority resolver using the Code-OSS `resolvers` proposed API. Use a packaged stock Code-OSS 1.143.1 client and an independently built Linux remote extension host (REH) server from the same upstream revision. The example checks both the staged product metadata and the running server's `/version`. Code-OSS binaries and sources are supplied separately by the developer.

In Ubuntu, set `server` to the absolute path to the staged server directory and start it in a dedicated terminal:

```sh
umask 077
state=$(mktemp -d /tmp/wsl-connector.XXXXXXXX)
python3 -c 'import secrets; print(secrets.token_hex(32))' > "$state/token"
mkdir "$state/project"
printf 'before\n' > "$state/project/connector-smoke.txt"
printf 'State directory: %s\n' "$state"
"$server/bin/code-server-oss" --start-server --socket-path="$state/remote.sock" \
  --connection-token-file="$state/token" --server-data-dir="$state/server-data"
```

Set these process environment variables in Windows PowerShell. Supply your actual paths. Use a fresh user-data directory and extension directory so this does not reuse an existing editor process.

```powershell
$env:WSL_CONNECTOR_DISTRO = 'Ubuntu'
$env:WSL_CONNECTOR_SERVER_ROOT = '/absolute/path/to/staged/server'
$state = '/tmp/wsl-connector.REPLACE_ME'
$env:WSL_CONNECTOR_SOCKET = "$state/remote.sock"
$env:WSL_CONNECTOR_TOKEN_FILE = "$state/token"
$uri = "vscode-remote://wsl-connector+Ubuntu$state/project"
$extension = (Resolve-Path examples/code-oss).ProviderPath
$profile = Join-Path $env:TEMP ("wsl-connector-" + [guid]::NewGuid())
& $code --user-data-dir "$profile/data" --extensions-dir "$profile/extensions" `
  --extensionDevelopmentPath "$extension" --enable-proposed-api june74.wsl-connector-example `
  --folder-uri "$uri"
```

Open `connector-smoke.txt`, edit it, save, and verify its contents independently in Ubuntu. For automation, add `--extensionTestsPath "$extension/smoke.cjs"` to the same command and look for `WSL_CONNECTOR_EDITOR_SAVE_PASS` in the extension host output. The smoke test requires the untouched disposable fixture above. Close Code-OSS and stop the manually launched server in its own terminal.

The Windows extension host launches per-connection WSL relays to the private Unix socket. Server staging and lifetime are operator-managed. No package downloader or editor server is included. The proposed API and server protocol are version-specific.

Verification status: the Windows-to-Ubuntu socket fixture passes. Opening and saving a workspace with the stock editor and matching server still requires a full integration run.
