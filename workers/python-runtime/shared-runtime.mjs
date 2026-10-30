import { Daytona } from '@daytona/sdk';
import { randomUUID } from 'node:crypto';
let defaultClient;
const getClient = () => defaultClient ??= new Daytona({ requestTimeoutMs: 30000 });

const deadline = (promise, ms) => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('operation timed out')), ms);
  })]).finally(() => clearTimeout(timer));
};

// Testing dependencies are injectable; normal calls use the configured Daytona API key.
export async function startPython({ code, onOutput = () => {}, maxOutput = 64000, daytona, timeoutMs = 30000, sandboxId = process.env.DAYTONA_SANDBOX_ID } = {}) {
  if (typeof sandboxId !== 'string' || !sandboxId.trim()) throw new Error('A dedicated sandbox is required');
  if (typeof code !== 'string' || Buffer.byteLength(code) > 64000) throw new Error('Invalid source');
  if (!Number.isSafeInteger(maxOutput) || maxOutput < 100 || maxOutput > 64000) throw new Error('Invalid output limit');
  const client = daytona ?? getClient();
  const id = randomUUID().replaceAll('-', '');
  const dir = `/tmp/zyx-${id}`;
  const runtimeDir = '/home/daytona/zyx-runtime';
  const marker = `ZYX_START_${id}`;
  let stage = 'lookup';
  const startedAt = performance.now();
  let stageAt = startedAt;
  const timings = {};
  const advance = (next) => { const now = performance.now(); timings[stage] = Math.round(now - stageAt); stage = next; stageAt = now; };
  const report = (outcome) => { advance('reported'); console.info('Python runtime timing', JSON.stringify({ outcome, ...timings, total: Math.round(performance.now() - startedAt) })); };
  let sandbox, pty, ptyRequested = false, ptyPending = false, stopped = false, finished = false, outputLimit = false, outputBytes = 0, inputBytes = 0, acceptOutput = false, markerBuffer = Buffer.alloc(0), cleanupPromise;
  let stopResolve;
  const stopSignal = new Promise((resolve) => { stopResolve = resolve; });
  const stop = () => { if (!stopped) { stopped = true; stopResolve(); } };
  const cleanup = () => cleanupPromise ??= (async () => {
    let failed = ptyPending;
    if (sandbox && ptyRequested) { try { await deadline(sandbox.process.killPtySession(`zyxpty-${id}`), 10000); } catch (error) { if (error?.statusCode !== 404) failed = true; } }
    if (pty) { try { await deadline(pty.disconnect(), 5000); } catch { /* Deletion remains authoritative. */ } }
    if (sandbox) { try { await deadline(sandbox.fs.deleteFile(dir, true), 10000); } catch (error) { if (error?.statusCode !== 404) failed = true; } }
    return failed;
  })();
  try {
    sandbox = await deadline(client.get(sandboxId), timeoutMs);
    advance('mkdir');
    const setup = await deadline(sandbox.process.executeCommand(`/bin/mkdir -p ${dir}/src`, undefined, {}, 10), timeoutMs);
    if (setup.exitCode !== 0) throw new Error('Runtime setup failed');
    advance('upload');
    await deadline(sandbox.fs.uploadFile(Buffer.from(code, 'utf8'), `${dir}/src/main.py`, 20), timeoutMs);
    advance('runtime-check');
    const setupRuntime = `test -x ${runtimeDir}/wasmtime && test -r ${runtimeDir}/python.wasm && test -d ${runtimeDir}/lib`;
    const checked = await deadline(sandbox.process.executeCommand(setupRuntime, undefined, {}, 20), timeoutMs);
    if (checked.exitCode !== 0) throw new Error('Runtime setup failed');
    advance('create-pty');
    ptyRequested = true; ptyPending = true;
    const ptyCreation = sandbox.process.createPty({ id: `zyxpty-${id}`, cols: 100, rows: 30, onData(data) {
      if (stopped || outputLimit) return;
      let bytes = Buffer.from(data);
      if (!acceptOutput) {
        markerBuffer = Buffer.concat([markerBuffer, bytes]);
        const position = markerBuffer.indexOf(marker);
        if (position < 0) { if (markerBuffer.length > 8192) markerBuffer = markerBuffer.subarray(-8192); return; }
        bytes = markerBuffer.subarray(position + marker.length);
        markerBuffer = Buffer.alloc(0); acceptOutput = true;
        timings.markerAt = Math.round(performance.now() - startedAt);
      }
      if (bytes.length && timings.firstOutputAt === undefined) timings.firstOutputAt = Math.round(performance.now() - startedAt);
      const allowed = Math.max(0, maxOutput - outputBytes);
      outputBytes += bytes.length;
      if (allowed && bytes.length) onOutput('stdout', bytes.subarray(0, allowed));
      if (bytes.length > allowed) { outputLimit = true; stopResolve(); }
    } });
    // A timed-out PTY create can resolve later; close that local socket as well.
    ptyCreation.then(handle => { ptyPending = false; if (cleanupPromise) { void sandbox.process.killPtySession(`zyxpty-${id}`).catch(() => {}); void handle.disconnect().catch(() => {}); } }, () => { ptyPending = false; });
    pty = await deadline(ptyCreation, timeoutMs);
    advance('pty-connect');
    await deadline(pty.waitForConnection(), 12000);
    // Source is uploaded separately; only generated hexadecimal ID enters shell text.
    const command = `stty -echo; printf '${marker.slice(0, 12)}%s' '${marker.slice(12)}'; exec ${runtimeDir}/wasmtime run -W fuel=5000000000,max-memory-size=134217728 --dir ${runtimeDir}/lib::/lib --dir ${dir}/src::/src --env PYTHONHOME=/ --env PYTHON_COLORS=0 --env NO_COLOR=1 ${runtimeDir}/python.wasm -u /src/main.py; exit 125\n`;
    advance('start-command');
    await deadline(pty.sendInput(command), 10000);
    advance('execution');
    const done = (async () => {
      let result = {};
      try { result = await Promise.race([pty.wait(), stopSignal.then(() => ({}))]); }
      catch { result = { error: true }; }
      finished = true;
      advance('cleanup');
      const cleanupFailed = await cleanup();
      report(cleanupFailed ? 'cleanup_failed' : 'finished');
      return { code: result.exitCode ?? null, signal: null, stopped, outputLimit, spawnError: result.exitCode == null && Boolean(result.error), cleanupFailed };
    })();
    return {
      input(value) {
        if (typeof value !== 'string' || stopped || finished || outputLimit) return false;
        const bytes = Buffer.byteLength(value);
        if (inputBytes + bytes > 8000) return false;
        inputBytes += bytes;
        deadline(pty.sendInput(value), 10000).catch(() => stop());
        return true;
      }, stop, done,
    };
  } catch (error) {
    const failedStage = stage;
    advance('cleanup');
    const cleanupFailed = await cleanup();
    report('failed');
    const status = Number(error?.statusCode ?? error?.status ?? 0);
    console.error('Daytona execution failed:', failedStage, Number.isInteger(status) && status >= 400 && status <= 599 ? status : 'unavailable', cleanupFailed ? 'cleanup-failed' : 'clean');
    const failure = new Error('Python runtime unavailable');
    failure.cleanupFailed = Boolean(cleanupFailed || error?.cleanupFailed);
    throw failure;
  }
}

export async function reconcileSandbox({ sandboxId = process.env.DAYTONA_SANDBOX_ID, daytona = getClient() } = {}) {
  if (typeof sandboxId !== 'string' || !sandboxId.trim()) throw new Error('A dedicated sandbox is required');
  let stage = 'lookup';
  try {
  const sandbox = await deadline(daytona.get(sandboxId), 30000);
  stage = 'sessions';
  const sessions = await deadline(sandbox.process.listPtySessions(), 30000);
  for (const session of sessions) if (/^zyxpty-[0-9a-f]{32}$/.test(session.id)) {
    stage = 'kill-session';
    try { await deadline(sandbox.process.killPtySession(session.id), 10000); } catch (error) { if (error?.statusCode !== 404) throw error; }
  }
  stage = 'files';
  const files = await deadline(sandbox.fs.listFiles('/tmp'), 30000);
  for (const file of files) if (/^zyx-[0-9a-f]{32}$/.test(file.name)) { stage = 'delete-file'; await deadline(sandbox.fs.deleteFile(`/tmp/${file.name}`, true), 10000); }
  } catch (error) {
    const status = Number(error?.statusCode ?? error?.status ?? 0);
    console.error('Daytona reconciliation failed:', stage, Number.isInteger(status) && status >= 400 && status <= 599 ? status : 'unavailable');
    throw new Error('Daytona reconciliation failed');
  }
}
