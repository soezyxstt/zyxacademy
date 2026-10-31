import test from 'node:test';
import assert from 'node:assert/strict';
import { startPython } from './daytona-runtime.mjs';

function fixture({ deleteFails = false, uploadFails = false, createError, runtimeMissing = false, heartbeatFails = false, uploadHangs = false } = {}) {
  const calls = { deletes: 0, uploads: [], sends: [], commands: [], ttl: [], refresh: 0 };
  let onData, resolveWait;
  const wait = new Promise(resolve => { resolveWait = resolve; });
  const pty = { waitForConnection: async () => {}, wait: () => wait, disconnect: async () => {}, sendInput: async (value) => { calls.sends.push(value); } };
  const sandbox = { setTtl: async (n) => { calls.ttl.push(n); if (heartbeatFails === true) throw new Error('refresh failed'); }, refreshActivity: async () => { calls.refresh++; if (heartbeatFails === 'activity') throw new Error('activity failed'); }, fs: { uploadFile: async (bytes, path) => { if (uploadHangs) return new Promise(() => {}); if (uploadFails) throw new Error('failed'); calls.uploads.push({ bytes, path }); } }, process: { executeCommand: async (command) => { calls.commands.push(command); return { exitCode: runtimeMissing && command.startsWith('test -x') ? 1 : 0 }; }, createPty: async (options) => { onData = options.onData; return pty; } } };
  const client = { create: async (params) => { calls.params = params; if (createError) throw createError; return sandbox; }, get: async () => sandbox, delete: async () => { calls.deletes++; if (deleteFails) throw new Error('failed'); } };
  return { calls, sandbox, client, data: (s) => onData(Buffer.from(s)), finish: (code = 0) => resolveWait({ exitCode: code }), marker() { const match = calls.sends[0].match(/zyx-([a-f0-9]{32})/); return `ZYX_START_${match[1]}`; } };
}
const opts = (f, extra = {}) => ({ code: 'print(input())', daytona: f.client, timeoutMs: 1000, snapshot: 'existing-runtime-snapshot', ...extra });

test('uploads source independently; start command and split marker are hidden', async () => {
  const f = fixture(); const output = [];
  const run = await startPython(opts(f, { onOutput: (stream, data) => output.push([stream, data.toString()]) }));
  assert.equal(f.calls.uploads[0].bytes.toString(), 'print(input())');
  assert(!f.calls.sends[0].includes('print(input())'));
  f.data(f.calls.sends[0]);
  assert.equal(output.length, 0);
  const marker = f.marker(); f.data(marker.slice(0, 9)); f.data(marker.slice(9) + 'Nama: ');
  assert.deepEqual(output, [['stdout', 'Nama: ']]);
  assert.equal(run.input('Ada\n'), true);
  await Promise.resolve(); assert.equal(f.calls.sends[1], 'Ada\n');
  f.data('Halo, Ada\n'); f.finish();
  assert.equal((await run.done).code, 0); assert.equal(f.calls.deletes, 1);
  assert.equal(run.input('late'), false);
});

test('stop is idempotent and destroys entire sandbox once', async () => {
  const f = fixture(); const run = await startPython(opts(f));
  run.stop(); run.stop(); const result = await run.done;
  assert.equal(result.stopped, true); assert.equal(f.calls.deletes, 1);
});

test('input bytes are capped at 8000', async () => {
  const f = fixture(); const run = await startPython(opts(f));
  assert.equal(run.input('é'.repeat(4000)), true); assert.equal(run.input('a'), false);
  run.stop(); await run.done;
});

test('output limit stops and destroys sandbox without exceeding limit', async () => {
  const f = fixture(); let size = 0;
  const run = await startPython(opts(f, { maxOutput: 100, onOutput: (_, data) => { size += data.length; } }));
  f.data(f.marker() + 'x'.repeat(101)); const result = await run.done;
  assert.equal(size, 100); assert.equal(result.outputLimit, true); assert.equal(f.calls.deletes, 1);
});

test('setup failure deletes sandbox; deletion failure is reported', async () => {
  const f = fixture({ uploadFails: true, deleteFails: true });
  await assert.rejects(startPython(opts(f)), e => e.cleanupFailed === true);
  assert.equal(f.calls.deletes, 1);
});

test('create timeout with sandbox ID attempts cleanup', async () => {
  const f = fixture({ createError: Object.assign(new Error('timeout'), { sandboxId: 'returned-id' }) });
  await assert.rejects(startPython(opts(f))); assert.equal(f.calls.deletes, 1);
});

test('snapshot uses installed runtime and uploads only source', async () => {
  const f = fixture();
  const run = await startPython(opts(f));
  assert.equal(f.calls.params.snapshot, 'existing-runtime-snapshot');
  assert.equal(f.calls.uploads.length, 1); assert.equal(f.calls.uploads[0].bytes.toString(), 'print(input())');
  assert(f.calls.sends[0].includes('/home/daytona/zyx-runtime/wasmtime'));
  run.stop(); await run.done; assert.equal(f.calls.deletes, 1);
});

test('snapshot missing runtime fails closed and destroys sandbox', async () => {
  const f = fixture({ runtimeMissing: true });
  await assert.rejects(startPython(opts(f, { snapshot: 'existing-runtime-snapshot' })));
  assert.equal(f.calls.deletes, 1); assert.equal(f.calls.sends.length, 0);
});

test('missing snapshot fails before creating sandbox', async () => {
  const f = fixture();
  await assert.rejects(startPython(opts(f, { snapshot: '' })), /snapshot/);
  assert.equal(f.calls.params, undefined);
});

test('heartbeat refreshes TTL and activity while input remains open, and stops after cleanup', async () => {
  const f = fixture(); const run = await startPython(opts(f, { heartbeatMs: 10 }));
  await new Promise(resolve => setTimeout(resolve, 30));
  assert(f.calls.ttl.length >= 1); assert.equal(f.calls.refresh, f.calls.ttl.length);
  assert(f.calls.ttl.every(n => n === 10));
  assert.equal(run.input('Ada\n'), true);
  run.stop(); await run.done; const count = f.calls.ttl.length;
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(f.calls.ttl.length, count); assert.equal(f.calls.deletes, 1);
});

test('heartbeat failure fails closed and destroys sandbox', async () => {
  const f = fixture({ heartbeatFails: true }); const run = await startPython(opts(f, { heartbeatMs: 10 }));
  const result = await run.done;
  assert.equal(result.spawnError, true); assert.equal(result.cleanupFailed, false); assert.equal(f.calls.deletes, 1);
});

test('activity refresh failure fails closed and destroys sandbox', async () => {
  const f = fixture({ heartbeatFails: 'activity' }); const run = await startPython(opts(f, { heartbeatMs: 10 }));
  const result = await run.done;
  assert.equal(result.spawnError, true); assert.equal(f.calls.refresh, 1); assert.equal(f.calls.deletes, 1);
});

test('heartbeat failure during startup cleans up despite an unresolved upload', async () => {
  const f = fixture({ heartbeatFails: true, uploadHangs: true });
  await assert.rejects(startPython(opts(f, { heartbeatMs: 10 })));
  assert.equal(f.calls.deletes, 1);
});
