import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import WebSocket from "ws";
import { createServerApp } from "./index.mjs";

const secret = randomBytes(32).toString("base64url"), origin = "https://staging.example.test";
function ticket(jti = randomBytes(18).toString("base64url")) {
  const body = Buffer.from(JSON.stringify({ aud: "zyx-python-staging", exp: Math.floor(Date.now() / 1000) + 60, jti })).toString("base64url");
  return `${body}.${createHmac("sha256", Buffer.from(secret, "base64url")).update(body).digest("base64url")}`;
}
const once = (emitter, event) => new Promise((resolve, reject) => { emitter.once(event, resolve); emitter.once("error", reject); });
test("health fails closed without a key", async () => {
  const app = createServerApp({ secret: "", origin, testReady: true });
  await new Promise(r => app.server.listen(0, "127.0.0.1", r));
  try {
    const response = await fetch(`http://127.0.0.1:${app.server.address().port}/health`);
    assert.equal((await response.json()).execution, "disabled");
  } finally { await new Promise(r => app.server.close(r)); }
});
test("health and websocket fail closed without Daytona configuration", async () => {
  for (const config of [
    { daytonaApiKey: "", sandboxId: "test" },
    { daytonaApiKey: "test-key", sandboxId: "" },
    { daytonaApiKey: "   ", sandboxId: "test" },
    { daytonaApiKey: "test-key", sandboxId: "   " },
  ]) {
    const app = createServerApp({ secret, origin, ...config });
    await new Promise(r => app.server.listen(0, "127.0.0.1", r));
    try {
      const base = `http://127.0.0.1:${app.server.address().port}`;
      assert.equal((await (await fetch(`${base}/health`)).json()).execution, "disabled");
      const ws = new WebSocket(base.replace("http:", "ws:") + "/v1/terminal", ["zyx-v1", `ticket.${ticket()}`], { origin });
      await assert.rejects(once(ws, "open"));
    } finally { await new Promise(r => app.server.close(r)); }
  }
});
test("health reports configured state when required values exist", async () => {
  const app = createServerApp({ secret, origin, daytonaApiKey: "test-key", sandboxId: "trusted-sandbox", reconcile: async()=>{} });
  await new Promise(r => app.server.listen(0, "127.0.0.1", r));
  try {
    const response = await fetch(`http://127.0.0.1:${app.server.address().port}/health`);
    assert.equal((await response.json()).execution, "ready");
  } finally { await new Promise(r => app.server.close(r)); }
});
test("health remains disabled when orphan reconciliation fails", async () => {
  const app = createServerApp({ secret, origin, daytonaApiKey: "test-key", sandboxId: "test", reconcile: async()=>{throw Error('failed')} });
  await new Promise(r=>app.server.listen(0,"127.0.0.1",r));
  try { assert.equal((await (await fetch(`http://127.0.0.1:${app.server.address().port}/health`)).json()).execution,"disabled"); }
  finally { await new Promise(r=>app.server.close(r)); }
});
test("only accepts signed, single-use tickets and forwards input", async () => {
  let captured = "", finish;
  const done = new Promise(r => { finish = r; });
  const app = createServerApp({ secret, origin, testReady: true, launch: async ({ onOutput }) => ({
    done, input(data) { captured += data; onOutput("stdout", Buffer.from("Halo, Ayu")); finish({ code: 0 }); return true; }, stop() { finish({ stopped: true }); },
  }) });
  await new Promise(r => app.server.listen(0, "127.0.0.1", r));
  const base = `ws://127.0.0.1:${app.server.address().port}/v1/terminal`;
  let ws;
  try {
    const value = ticket();
    ws = new WebSocket(base, ["zyx-v1", `ticket.${value}`], { origin });
    await once(ws, "open");
    const events = [];
    ws.on("message", raw => { const event = JSON.parse(raw); events.push(event); if (event.type === "running") ws.send(JSON.stringify({ type: "input", data: "Ayu\n" })); });
    ws.send(JSON.stringify({ type: "start", code: "print(input())" }));
    await once(ws, "close");
    assert.equal(captured, "Ayu\n");
    assert.equal(Buffer.from(events.find(e => e.type === "output").data, "base64").toString(), "Halo, Ayu");
    assert.equal(events.find(e => e.type === "result").status, "completed");
    const replay = new WebSocket(base, ["zyx-v1", `ticket.${value}`], { origin });
    await assert.rejects(once(replay, "open"));
    const wrongOrigin = new WebSocket(base, ["zyx-v1", `ticket.${ticket()}`], { origin: "https://other.example.test" });
    await assert.rejects(once(wrongOrigin, "open"));
  } finally { ws?.terminate(); await new Promise(r => app.server.close(r)); }
});

test("cleanup failure disables subsequent execution", async () => {
  const app = createServerApp({ secret, origin, testReady:true, launch:async()=>({ input(){return true}, stop(){}, done:Promise.resolve({code:0,cleanupFailed:true}) }) });
  await new Promise(r=>app.server.listen(0,"127.0.0.1",r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const ws=new WebSocket(base.replace('http:','ws:')+'/v1/terminal',['zyx-v1',`ticket.${ticket()}`],{origin});
  try {
    await once(ws,'open');
    ws.send(JSON.stringify({type:'start',code:'print(1)'}));
    await once(ws,'close');
    assert.equal((await (await fetch(`${base}/health`)).json()).execution,'disabled');
  } finally {ws.terminate();await new Promise(r=>app.server.close(r));}
});
test("setup cleanup failure disables subsequent execution", async () => {
  const app = createServerApp({ secret, origin, testReady:true, launch:async()=>{const e=new Error('cleanup failed');e.cleanupFailed=true;throw e;} });
  await new Promise(r=>app.server.listen(0,"127.0.0.1",r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const ws=new WebSocket(base.replace('http:','ws:')+'/v1/terminal',['zyx-v1',`ticket.${ticket()}`],{origin});
  try {
    await once(ws,'open');ws.send(JSON.stringify({type:'start',code:'print(1)'}));await once(ws,'close');
    assert.equal((await (await fetch(`${base}/health`)).json()).execution,'disabled');
  } finally {ws.terminate();await new Promise(r=>app.server.close(r));}
});

test("startup retries reconciliation and remains closed until it succeeds", async () => {
  let attempts = 0;
  const app = createServerApp({ secret, origin, daytonaApiKey: "test-key", sandboxId: "test", reconcile: async () => { if (++attempts === 1) throw Error("offline"); } });
  await new Promise(r => app.server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  try {
    assert.equal((await (await fetch(`${base}/health`)).json()).execution, "disabled");
    await new Promise(r => setTimeout(r, 16000));
    assert.equal((await (await fetch(`${base}/health`)).json()).execution, "ready");
    assert.equal(attempts, 2);
  } finally { await new Promise(r => app.server.close(r)); }
});

test('warm session prepares before receiving source and completes after start', async () => {
  let received, release;
  const app = createServerApp({ secret, origin, testReady: true, launch: async ({ codeReady, onPrepared }) => {
    onPrepared(); received = await codeReady;
    return { input() { return true; }, stop() {}, done: Promise.resolve({ code: 0 }) };
  }});
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const ws = new WebSocket(`ws://127.0.0.1:${app.server.address().port}/v1/terminal`, ['zyx-v1', 'zyx-warm', `ticket.${ticket()}`], { origin });
  try {
    const closed = once(ws, 'close');
    ws.on('message', raw => { const m=JSON.parse(raw); if(m.type==='ready') ws.send(JSON.stringify({type:'prepare'})); if(m.type==='prepared') { assert.equal(received,undefined);ws.send(JSON.stringify({type:'start',code:'print(42)'})); } if(m.type==='result') release=m.status; });
    await closed;assert.equal(received,'print(42)');assert.equal(release,'completed');
  } finally { ws.terminate();await new Promise(r=>app.server.close(r)); }
});

test('only an authenticated connection may evict an idle warm session', async () => {
  const app=createServerApp({secret,origin,testReady:true,launch:async({codeReady,onPrepared})=>{onPrepared?.();if(codeReady) await codeReady;return {stop(){},input(){return true},done:new Promise(()=>{})}}});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`ws://127.0.0.1:${app.server.address().port}/v1/terminal`;
  const warm=new WebSocket(base,['zyx-v1','zyx-warm',`ticket.${ticket()}`],{origin});const active=new WebSocket(base,['zyx-v1',`ticket.${ticket()}`],{origin});
  try {
    const prepared=new Promise(resolve=>warm.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='ready')warm.send(JSON.stringify({type:'prepare'}));if(m.type==='prepared')resolve()}));
    await Promise.all([prepared,once(active,'open')]);
    const invalid=new WebSocket(base,['zyx-v1','ticket.invalid.invalid'],{origin});await assert.rejects(once(invalid,'open'));assert.equal(warm.readyState,WebSocket.OPEN);
    const speculative=new WebSocket(base,['zyx-v1','zyx-warm',`ticket.${ticket()}`],{origin});await assert.rejects(once(speculative,'open'));assert.equal(warm.readyState,WebSocket.OPEN);
    const closed=once(warm,'close');const third=new WebSocket(base,['zyx-v1',`ticket.${ticket()}`],{origin});await assert.rejects(once(third,'open'));await closed;assert.equal(active.readyState,WebSocket.OPEN);
  } finally {warm.terminate();active.terminate();await new Promise(r=>app.server.close(r));}
});


test('expired warm session cancels preparation and releases capacity after cleanup', async () => {
  let cancelled = false;
  const app = createServerApp({ secret, origin, testReady: true, warmTtlMs: 30, launch: async ({ codeReady, onPrepared }) => {
    onPrepared(); try { await codeReady; } catch { cancelled = true; throw new Error('cancelled'); }
  }});
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `ws://127.0.0.1:${app.server.address().port}/v1/terminal`;
  const ws = new WebSocket(base, ['zyx-v1', 'zyx-warm', `ticket.${ticket()}`], { origin });
  try {
    ws.on('message', raw => { if (JSON.parse(raw).type === 'ready') ws.send(JSON.stringify({type:'prepare'})); });
    await once(ws, 'close');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(cancelled, true);
    const next = new WebSocket(base, ['zyx-v1', 'zyx-warm', `ticket.${ticket()}`], { origin });
    await once(next, 'open'); next.terminate();
  } finally { ws.terminate(); await new Promise(resolve => app.server.close(resolve)); }
});
