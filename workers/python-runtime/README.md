# Python runtime worker

This staging worker runs CPython 3.13.11 WASI with Wasmtime 50.0.1 inside a dedicated Daytona sandbox for each execution. It does not grade submissions and is not yet connected to the Zyx application. The snapshot must contain verified runtime assets at `/home/daytona/zyx-runtime/`.

## Render setup

- Root directory: `workers/python-runtime`
- Build command: `npm run build`
- Start command: `npm run start`
- Required variables: `PYTHON_RUNTIME_ORIGIN`, `PYTHON_RUNTIME_TOKEN_SECRET`, `DAYTONA_API_KEY`, and `DAYTONA_PYTHON_SNAPSHOT`. The ticket secret must contain at least 32 cryptographically random bytes encoded as unpadded base64url. Never expose credentials to browsers or the sandbox.
- `/health` reports `execution: disabled` when required variables are missing. `ready` means configuration is present, not that Daytona or the snapshot has been checked.

The staging application has not yet implemented ticket issuance or a terminal client.

## Protocol

Connect to `/v1/terminal` with an exact Origin match and WebSocket subprotocols `zyx-v1` and `ticket.<payload>.<signature>`. The base64url JSON payload contains audience `zyx-python-staging`, integer `exp` no more than 90 seconds in the future, and random base64url `jti` of 22 to 80 characters. Signature is unpadded base64url HMAC-SHA256 of the payload using the decoded secret. Tickets are accepted once per process while valid. A single-instance deployment is required for replay protection.

Send JSON `{"type":"start","code":"..."}` once. After `running`, send `{"type":"input","data":"..."}` for standard input, including newline; send `{"type":"stop"}` to terminate. Server messages include `ready`, `running`, `output` with `stream` and base64 `data`, and `result`. Close the connection to stop execution. Decode output as a stream to preserve Unicode across chunk boundaries. The PTY combines stdout and stderr.

The worker supports two concurrent sessions per process, a 64 KB source limit, 8 KB total input, 64 KB output, 128 MiB WebAssembly linear memory, and 5 billion Wasmtime fuel units. Guest code has no host environment, subprocess, or network access through WASI. The sandbox requests `networkBlockAll`, but Daytona tier policies determine whether that request is enforced. Do not mount secrets or volumes into the sandbox.

The adapter refreshes the sandbox's 10 minute TTL and activity every 60 seconds while a session is active. Failed refresh stops execution. Auto-stop, auto-delete, and TTL provide fallback cleanup; cleanup failure disables new sessions in the worker. A failed create with an ambiguous outcome requires operator reconciliation. Connection and cost limits are per process and do not replace global user or spending limits. Active sessions consume Daytona credit, including while waiting for input.

## Tests

`npm run build` installs pinned dependencies and checks syntax. Run `npm test` for gateway and Daytona adapter tests. For the independent local WASI tests, build the local assets with `node build.mjs`, set `WASI_TEST_ROOT` to `.runtime` and `WASI_EXECUTABLE` to `.runtime/wasmtime`, then run `npm run test:integration` and `npm run test:gateway` on non-root Linux.
