import { Daytona } from '@daytona/sdk';
import { randomUUID } from 'node:crypto';

const deadline = (promise, ms) => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('operation timed out')), ms);
  })]).finally(() => clearTimeout(timer));
};

// Testing dependencies are injectable; normal calls use the configured Daytona API key.
export async function startPython({ code, onOutput = () => {}, maxOutput = 64000, daytona, timeoutMs = 30000, ttlMinutes = 10, snapshot = process.env.DAYTONA_PYTHON_SNAPSHOT, heartbeatMs = 60000 } = {}) {
  if (typeof snapshot !== 'string' || !snapshot.trim()) throw new Error('A verified runtime snapshot is required');
  if (typeof code !== 'string' || Buffer.byteLength(code) > 64000) throw new Error('Invalid source');
  if (!Number.isSafeInteger(maxOutput) || maxOutput < 100 || maxOutput > 64000) throw new Error('Invalid output limit');
  if (!Number.isSafeInteger(ttlMinutes) || ttlMinutes < 1 || ttlMinutes > 60) throw new Error('Invalid TTL');
  if (!Number.isSafeInteger(heartbeatMs) || heartbeatMs < 1 || heartbeatMs > 60000) throw new Error('Invalid heartbeat');
  const client = daytona ?? new Daytona();
  const id = randomUUID().replaceAll('-', '');
  const dir = `/tmp/zyx-${id}`;
  const runtimeDir = '/home/daytona/zyx-runtime';
  const marker = `ZYX_START_${id}`;
  let sandbox, pty, stopped = false, finished = false, heartbeatFailed = false, heartbeatTimer, outputLimit = false, outputBytes = 0, inputBytes = 0, acceptOutput = false, markerBuffer = Buffer.alloc(0), cleanupPromise;
  let stopResolve;
  const stopSignal = new Promise((resolve) => { stopResolve = resolve; });
  const stop = () => { if (!stopped) { stopped = true; stopResolve(); } };
  let rejectHeartbeat;
  const heartbeatFailure = new Promise((_, reject) => { rejectHeartbeat = reject; });
  // A rejection may happen while execution is active rather than in startup.
  heartbeatFailure.catch(() => {});
  const guard = (p) => Promise.race([p, heartbeatFailure]);
  const scheduleHeartbeat = () => {
    heartbeatTimer = setTimeout(async () => {
      try {
        await deadline(sandbox.setTtl(ttlMinutes), 10000);
        if (cleanupPromise || finished) return;
        await deadline(sandbox.refreshActivity(), 10000);
        if (!cleanupPromise && !finished) scheduleHeartbeat();
      } catch {
        if (cleanupPromise || finished) return;
        heartbeatFailed = true;
        rejectHeartbeat(new Error('Sandbox heartbeat failed'));
        stopResolve();
      }
    }, heartbeatMs);
    heartbeatTimer.unref?.();
  };
  const cleanup = () => cleanupPromise ??= (async () => {
    clearTimeout(heartbeatTimer);
    let failed = false;
    if (pty) { try { await deadline(pty.disconnect(), 5000); } catch { /* Deletion remains authoritative. */ } }
    if (sandbox) { try { await deadline(client.delete(sandbox, 10, true), 15000); } catch { failed = true; } }
    return failed;
  })();
  try {
    const params = { name: `zyx-${id}`, labels: { application: 'zyx-python-staging', execution: id }, public: false, networkBlockAll: true, autoStopInterval: 5, autoDeleteInterval: 0, ttlMinutes };
    params.snapshot = snapshot;
    // The SDK exposes sandboxId on create timeout; do not wrap create in a race
    // that could lose the ID before cleanup is possible.
    try { sandbox = await client.create(params, { timeout: Math.ceil(timeoutMs / 1000) }); }
    catch (error) {
      if (error?.sandboxId) { try { sandbox = await deadline(client.get(error.sandboxId), 5000); } catch { const e = new Error('Sandbox cleanup unavailable'); e.cleanupFailed = true; throw e; } }
      else if (!error?.statusCode || error.statusCode >= 500) { const e = new Error('Sandbox creation outcome unknown'); e.cleanupFailed = true; throw e; }
      throw new Error('Sandbox creation failed');
    }
    scheduleHeartbeat();
    const setup = await guard(deadline(sandbox.process.executeCommand(`/bin/mkdir -p ${dir}/src`, undefined, {}, 10), timeoutMs));
    if (setup.exitCode !== 0) throw new Error('Runtime setup failed');
    await guard(deadline(sandbox.fs.uploadFile(Buffer.from(code, 'utf8'), `${dir}/src/main.py`, 20), timeoutMs));
    const setupRuntime = `test -x ${runtimeDir}/wasmtime && test -r ${runtimeDir}/python.wasm && test -d ${runtimeDir}/lib`;
    const checked = await guard(deadline(sandbox.process.executeCommand(setupRuntime, undefined, {}, 20), timeoutMs));
    if (checked.exitCode !== 0) throw new Error('Runtime setup failed');
    const ptyCreation = sandbox.process.createPty({ id: `run-${id}`, cols: 100, rows: 30, onData(data) {
      if (stopped || heartbeatFailed || outputLimit) return;
      let bytes = Buffer.from(data);
      if (!acceptOutput) {
        markerBuffer = Buffer.concat([markerBuffer, bytes]);
        const position = markerBuffer.indexOf(marker);
        if (position < 0) { if (markerBuffer.length > 8192) markerBuffer = markerBuffer.subarray(-8192); return; }
        bytes = markerBuffer.subarray(position + marker.length);
        markerBuffer = Buffer.alloc(0); acceptOutput = true;
      }
      const allowed = Math.max(0, maxOutput - outputBytes);
      outputBytes += bytes.length;
      if (allowed && bytes.length) onOutput('stdout', bytes.subarray(0, allowed));
      if (bytes.length > allowed) { outputLimit = true; stopResolve(); }
    } });
    // A timed-out PTY create can resolve later; close that local socket as well.
    ptyCreation.then(handle => { if (cleanupPromise) void handle.disconnect().catch(() => {}); }, () => {});
    pty = await guard(deadline(ptyCreation, timeoutMs));
    await guard(deadline(pty.waitForConnection(), 12000));
    // Source is uploaded separately; only generated hexadecimal ID enters shell text.
    const command = `stty -echo; printf '${marker.slice(0, 12)}%s' '${marker.slice(12)}'; exec ${runtimeDir}/wasmtime run -W fuel=5000000000,max-memory-size=134217728 --dir ${runtimeDir}/lib::/lib --dir ${dir}/src::/src --env PYTHONHOME=/ ${runtimeDir}/python.wasm -u /src/main.py; exit 125\n`;
    await guard(deadline(pty.sendInput(command), 10000));
    const done = (async () => {
      let result = {};
      try { result = await Promise.race([pty.wait(), stopSignal.then(() => ({}))]); }
      catch { result = { error: true }; }
      finished = true;
      const cleanupFailed = await cleanup();
      return { code: result.exitCode ?? null, signal: null, stopped, outputLimit, spawnError: Boolean(result.error || heartbeatFailed), cleanupFailed };
    })();
    return {
      input(value) {
        if (typeof value !== 'string' || stopped || finished || heartbeatFailed || outputLimit) return false;
        const bytes = Buffer.byteLength(value);
        if (inputBytes + bytes > 8000) return false;
        inputBytes += bytes;
        deadline(pty.sendInput(value), 10000).catch(() => stop());
        return true;
      }, stop, done,
    };
  } catch (error) {
    const cleanupFailed = await cleanup();
    const failure = new Error('Python runtime unavailable');
    failure.cleanupFailed = Boolean(cleanupFailed || error?.cleanupFailed);
    throw failure;
  }
}
