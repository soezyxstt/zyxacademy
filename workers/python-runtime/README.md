# Python runtime worker

This shared staging and production worker runs CPython 3.13.11 WASI with Wasmtime 50.0.1 inside one dedicated, continuously running Daytona sandbox. Each execution uses a separate WASI process and source directory. It does not grade submissions and serves the Zyx interactive terminal. The sandbox must contain verified runtime assets at `/home/daytona/zyx-runtime/`.

## Render setup

- Root directory: `workers/python-runtime`
- Build command: `npm run build`
- Start command: `npm run start`
- Required variables: `PYTHON_RUNTIME_ORIGIN` (comma-separated exact HTTPS origins), `PYTHON_RUNTIME_TOKEN_SECRET`, `DAYTONA_API_KEY`, and `DAYTONA_SANDBOX_ID`. The ticket secret must contain at least 32 cryptographically random bytes encoded as unpadded base64url. Never expose credentials to browsers or the sandbox.
- `/health` reports `execution: disabled` when variables are missing or startup reconciliation fails. `ready` confirms startup reconciliation succeeded, not ongoing Daytona availability.

The staging and production applications issue short-lived tickets after checking course access. Configure `PYTHON_RUNTIME_ORIGIN=https://staging.zyxacademy.com,https://www.zyxacademy.com,https://zyxacademy.com` to share this worker. Set the same `PYTHON_RUNTIME_TOKEN_SECRET` in the worker, Cloud Run staging, GitHub Environment staging, and Vercel Production. Rotate these together, then verify new tickets; active connections can be interrupted by the worker deployment.

## Protocol

Connect to `/v1/terminal` with an exact match against the configured origins and WebSocket subprotocols `zyx-v1` and `ticket.<payload>.<signature>`. The base64url JSON payload contains audience `zyx-python-staging` for staging, or `zyx-python-production` for the production origins, integer `exp` no more than 90 seconds in the future, and random base64url `jti` of 22 to 80 characters. Signature is unpadded base64url HMAC-SHA256 of the payload using the decoded secret. Tickets are accepted once per process while valid. A single-instance deployment is required for replay protection.

An editor may include `zyx-warm` as a WebSocket subprotocol, send `{"type":"prepare"}`, and wait for `prepared` before sending code. At most one idle prepared session is allowed; it expires after 60 seconds and an authenticated non-warm connection can preempt it when capacity is full. Cleanup finishes before the slot is released. A client must fall back to a fresh ticket if preparation fails or expires. Send JSON `{"type":"start","code":"..."}` once. After `running`, send `{"type":"input","data":"..."}` for standard input, including newline; send `{"type":"stop"}` to terminate. Server messages include `ready`, `running`, `output` with `stream` and base64 `data`, and `result`. Close the connection to stop execution. Decode output as a stream to preserve Unicode across chunk boundaries. The PTY combines stdout and stderr.

The worker supports two concurrent sessions per process, a 64 KB source limit, 8 KB total input, 64 KB output, 128 MiB WebAssembly linear memory, and 5 billion Wasmtime fuel units. Guest code has no host environment, subprocess, or network access through WASI. The sandbox requests `networkBlockAll`, but Daytona tier policies determine whether that request is enforced. Do not mount secrets or volumes into the sandbox.

The sandbox is configured without automatic stop or deletion and consumes Daytona credit continuously, including when idle. Per-session PTYs and source directories are deleted on completion, cancellation, or disconnect. Startup reconciliation removes orphaned worker PTYs and directories before enabling execution; a reconciliation or cleanup failure disables new sessions. Deploys may interrupt sessions while the new worker reconciles. Run only one worker instance against this sandbox, since reconciliation removes prior worker sessions and ticket replay protection is process-local. Two connections share the sandbox's 1 CPU and 1 GiB memory. This limit is not a global user or spending quota.

## Tests

`npm run build` installs pinned dependencies and checks syntax. Run `npm test` for gateway and Daytona adapter tests. For the independent local WASI tests, build the local assets with `node build.mjs`, set `WASI_TEST_ROOT` to `.runtime` and `WASI_EXECUTABLE` to `.runtime/wasmtime`, then run `npm run test:integration` and `npm run test:gateway` on non-root Linux.
