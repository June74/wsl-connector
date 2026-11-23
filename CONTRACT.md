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
