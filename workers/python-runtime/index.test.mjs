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
    { daytonaApiKey: "", snapshot: "snapshot" },
    { daytonaApiKey: "test-key", snapshot: "" },
    { daytonaApiKey: "   ", snapshot: "snapshot" },
    { daytonaApiKey: "test-key", snapshot: "   " },
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
  const app = createServerApp({ secret, origin, daytonaApiKey: "test-key", snapshot: "trusted-snapshot" });
  await new Promise(r => app.server.listen(0, "127.0.0.1", r));
  try {
    const response = await fetch(`http://127.0.0.1:${app.server.address().port}/health`);
    assert.equal((await response.json()).execution, "ready");
  } finally { await new Promise(r => app.server.close(r)); }
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
