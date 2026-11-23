# Connector contract

The connector owns discovery and selection of a WSL distribution, starting or attaching to a compatible editor server there, and returning a usable remote connection to the Windows editor. The editor and remote server are separate components.

| Area | Required behavior |
| --- | --- |
| Distribution selection | Use an explicitly selected, installed distribution. If it is missing or unavailable, identify it in the error and stop. |
| Paths | Treat Windows and Linux paths as distinct. Use WSL path translation where applicable, verify the resulting path in the selected distribution, and preserve spaces and Unicode. |
| Process launch | Send literal argument vectors through the Windows/WSL boundary. Preserve the requested Linux working directory, separate stdout and stderr, and propagate the exit status. |
| Server compatibility | Match the editor's exact server revision, platform, and architecture. If installation is supported, verify integrity against a trusted checksum, reject escaping archive entries, and stage atomically under an installation lock. |
| Readiness and authentication | Bound startup time. Accept readiness only from the expected launch. Authenticate the connection with a private per-launch credential and omit it from logs. Keep the listener private to the connection. |
| Reconnect and shutdown | Distinguish disconnect, cancellation, and server shutdown. Reconnect only to a compatible server with verified identity. Cancel only owned work and leave unrelated processes and clients intact. |
| Failure reporting | Surface distribution, path, compatibility, verification, startup, and connection failures distinctly. Avoid falling back to a different distribution or an unmatched server. |

The supplied smoke tests cover literal arguments, Linux cwd, separate output streams and exit status, and cancellation of a fixture-owned Linux process group. The remaining requirements need connector implementation and integration tests.

## Current implementation

The CLI implements the process transport for explicitly chosen Linux commands, including stdio services installed by the caller. It does not discover installed distributions, install or authenticate an editor server, attach to an existing server, allocate a PTY, or reconnect. The server-specific rows above describe requirements for a future editor integration.

The Linux relay starts each command in a separate process group and cleans up members that stay in that group when the session ends. Commands that create a new session or move themselves to another process group are outside that cleanup guarantee. Stdin EOF is a half-close and allows the command to finish writing a response. Cancellation or loss of the host control stream ends the session. Interactive applications that need a PTY are outside the stdio contract.
