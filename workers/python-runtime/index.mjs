import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import { WebSocketServer } from "ws";
import { startPython, reconcileSandbox } from "./shared-runtime.mjs";

export function createServerApp({ secret = process.env.PYTHON_RUNTIME_TOKEN_SECRET, origin = process.env.PYTHON_RUNTIME_ORIGIN, daytonaApiKey = process.env.DAYTONA_API_KEY, sandboxId = process.env.DAYTONA_SANDBOX_ID, assets = {}, launch = startPython, reconcile = reconcileSandbox, testReady = false } = {}) {
  const key = typeof secret === "string" && /^[A-Za-z0-9_-]{43,}$/.test(secret) ? Buffer.from(secret, "base64url") : Buffer.alloc(0);
  const configured = key.length >= 32 && Boolean(origin) && typeof daytonaApiKey === "string" && Boolean(daytonaApiKey.trim()) && typeof sandboxId === "string" && Boolean(sandboxId.trim());
  let ready = key.length >= 32 && Boolean(origin) && testReady;
  const nonces = new Map();
  const clients = new Set();
  let attemptWindow = 0, attempts = 0;
  const server = createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") return res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify({ service: "python-runtime", execution: ready ? "ready" : "disabled" }));
    res.writeHead(404).end();
  });
  if (configured && !testReady) server.once("listening", () => {
    const attempt = async () => {
      try { await reconcile({ sandboxId }); ready = true; }
      catch { if (server.listening) setTimeout(attempt, 15000).unref(); }
    };
    void attempt();
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 70000, perMessageDeflate: false, handleProtocols: (protocols) => protocols.has("zyx-v1") ? "zyx-v1" : false });
  function verify(raw) {
    if (!raw || raw.length > 1200) return false;
    const [body, signature, extra] = raw.split(".");
    if (extra !== undefined || !/^[A-Za-z0-9_-]+$/.test(body || "") || !/^[A-Za-z0-9_-]+$/.test(signature || "")) return false;
    const expected = createHmac("sha256", key).update(body).digest();
    const supplied = Buffer.from(signature, "base64url");
    if (supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) return false;
    let ticket; try { ticket = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); } catch { return false; }
    const now = Math.floor(Date.now() / 1000);
    if (ticket.aud !== "zyx-python-staging" || !Number.isSafeInteger(ticket.exp) || ticket.exp <= now || ticket.exp > now + 90 || typeof ticket.jti !== "string" || !/^[A-Za-z0-9_-]{22,80}$/.test(ticket.jti)) return false;
    for (const [jti, exp] of nonces) if (exp <= now) nonces.delete(jti);
    if (nonces.has(ticket.jti) || nonces.size >= 10000) return false;
    nonces.set(ticket.jti, ticket.exp);
    return true;
  }
  server.on("upgrade", (req, socket, head) => {
    const now = Date.now();
    if (now - attemptWindow >= 10000) { attemptWindow = now; attempts = 0; }
    if (++attempts > 60) { socket.write("HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n"); socket.destroy(); return; }
    const protocols = (req.headers["sec-websocket-protocol"] || "").split(",").map((value) => value.trim());
    const tokens = protocols.filter((p) => p.startsWith("ticket."));
    if (!ready || req.url !== "/v1/terminal" || req.headers.origin !== origin || clients.size >= 2 || !protocols.includes("zyx-v1") || tokens.length !== 1 || !verify(tokens[0].slice(7))) { socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n"); socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => { clients.add(ws); wss.emit("connection", ws); });
  });
  wss.on("connection", (ws) => {
    let run, starting = false, ended = false, released = false;
    const release = () => { if (!released) { released = true; clients.delete(ws); } };
    const finish = (result) => { if (result.cleanupFailed) { ready = false; for (const client of clients) if (client !== ws) client.terminate(); } release(); };
    const send = (value) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(value)); };
    const startTimer = setTimeout(() => { if (!starting && !run) ws.close(1008, "Start required"); }, 15000);
    let alive = true;
    ws.on("pong", () => { alive = true; });
    const heartbeat = setInterval(() => { if (!alive) return ws.terminate(); alive = false; ws.ping(); }, 30000);
    ws.on("error", () => {});
    ws.on("close", () => { ended = true; clearTimeout(startTimer); clearInterval(heartbeat); run?.stop(); if (!starting && !run) release(); });
    ws.on("message", async (raw, binary) => {
      if (binary) return ws.close(1003);
      let msg; try { msg = JSON.parse(raw.toString("utf8")); } catch { return ws.close(1007); }
      if (!msg || typeof msg !== "object" || Array.isArray(msg)) return ws.close(1007);
      if (msg.type === "start" && !starting && !run && typeof msg.code === "string" && Buffer.byteLength(msg.code) <= 64000 && Object.keys(msg).length === 2) {
        starting = true; clearTimeout(startTimer);
        try {
          run = await launch({ ...assets, sandboxId, code: msg.code, onOutput: (stream, bytes) => send({ type: "output", stream, data: bytes.toString("base64") }) });
          if (ended) { run.stop(); finish(await run.done); return; }
          send({ type: "running" });
          const result = await run.done;
          finish(result);
          send({ type: "result", status: result.cleanupFailed || result.spawnError ? "unavailable" : result.outputLimit ? "output_limit" : result.stopped ? "stopped" : result.code === 0 ? "completed" : "error" });
          ws.close(1000);
        } catch (error) { if (error?.cleanupFailed) finish({ cleanupFailed: true }); else release(); send({ type: "result", status: "unavailable" }); ws.close(1011); }
      } else if (msg.type === "input" && run && typeof msg.data === "string" && Object.keys(msg).length === 2) {
        if (!run.input(msg.data)) { send({ type: "result", status: "input_limit" }); run.stop(); }
      } else if (msg.type === "stop" && Object.keys(msg).length === 1) { if (run) run.stop(); else { ended = true; ws.close(1000); } }
      else ws.close(1008);
    });
    send({ type: "ready" });
  });
  return { server, wss };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = createServerApp();
  app.server.listen(Number(process.env.PORT || 10000), "0.0.0.0");
}
