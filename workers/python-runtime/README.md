# Python runtime worker

This worker is a staging candidate. It does not grade submissions and is not yet connected to the Zyx application. It uses CPython 3.13.11 compiled to WASI and Wasmtime 50.0.1. The build downloads both archives and checks pinned SHA-256 digests.

## Render setup

- Root directory: `workers/python-runtime`
- Build command: `npm run build`
- Start command: `npm run start`
- Required service variables: `PYTHON_RUNTIME_ORIGIN` is the exact staging web origin; `PYTHON_RUNTIME_TOKEN_SECRET` is at least 32 cryptographically random bytes encoded as unpadded base64url. Set the same secret only in the trusted staging ticket issuer, never in browser code. These variables are not needed to build.
- `/health` returns `execution: disabled` until the variables and assets are present and the Linux process is non-root.

Do not include database, application, or provider credentials in this service. The staging app has not yet implemented ticket issuance or a terminal client.

## Protocol

Connect to `/v1/terminal` with an exact Origin match and WebSocket subprotocols `zyx-v1` and `ticket.<payload>.<signature>`. Payload is base64url JSON containing audience `zyx-python-staging`, integer `exp` no more than 90 seconds in the future, and random base64url `jti` of 22 to 80 characters. Signature is unpadded base64url HMAC-SHA256 of the payload using the decoded secret. Tickets are accepted once per process while valid. A single-instance deployment is required for this replay protection.

Send JSON `{"type":"start","code":"..."}` once. After `running`, send `{"type":"input","data":"..."}` for standard input, including newline; send `{"type":"stop"}` to terminate. Messages from the server include `ready`, `running`, `output` with `stream` and base64 `data`, and `result`. Close the connection to stop execution. Output chunks must be decoded as a stream to preserve Unicode across chunk boundaries.

The worker supports two concurrent sessions, a 64 KB source limit, 8 KB total input, 64 KB combined output, 128 MiB WebAssembly linear memory and 5 billion Wasmtime fuel units. WebSocket heartbeat detects dropped connections. There is no five-second input deadline. These limits do not constitute a host-wide memory quota or a guarantee against denial of service. The free Render instance can still exhaust resources or cold-start slowly.

Each execution copies the standard library to a session directory, makes it read-only, supplies no host environment or network, and removes it on exit. The worker refuses root execution and disables new sessions if cleanup fails. Process crashes and platform termination require operational monitoring and cleanup validation.

## Tests

`npm run build` installs pinned dependencies, verifies archive checksums, and builds assets on Linux x64. Run `npm test` for gateway contract tests. Set `WASI_TEST_ROOT` to the absolute `.runtime` directory and `WASI_EXECUTABLE` to its `wasmtime` executable, then run `npm run test:integration` and `npm run test:gateway` on non-root Linux.
