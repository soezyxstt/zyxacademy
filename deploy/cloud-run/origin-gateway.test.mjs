import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const gateway = fileURLToPath(new URL("./origin-gateway.mjs", import.meta.url));
const token = "A".repeat(43);
const publicOrigin = "https://staging.zyxacademy.com";

async function freePort() {
  const listener = createServer().listen(0, "127.0.0.1");
  await once(listener, "listening");
  const { port } = listener.address();
  await new Promise(resolve => listener.close(resolve));
  return port;
}

test("origin guard covers static and dynamic paths and forwards streaming HTTP safely", { timeout: 8000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), "zyx-origin-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, "server.js"), `
    const { createServer } = require("node:http");
    createServer(async (req, res) => {
      if (req.url === "/api/stream") {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write("data: first\\n\\n");
        const timer = setTimeout(() => res.end("data: second\\n\\n"), 5000);
        res.on("close", () => clearTimeout(timer));
        return;
      }
      if (req.url === "/dashboard") {
        res.writeHead(307, { Location: req.headers["x-forwarded-proto"] + "://" + req.headers.host + "/sign-in" }).end();
        return;
      }
      let size = 0;
      for await (const part of req) size += part.length;
      res.setHeader("Set-Cookie", ["first=a; Secure", "second=b; Secure"]);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ method: req.method, url: req.url, headers: req.headers, size,
        hasOriginToken: Boolean(process.env.CLOUD_RUN_ORIGIN_TOKEN) }));
    }).listen(Number(process.env.PORT), process.env.HOSTNAME);
  `);

  const port = await freePort();
  const child = spawn(process.execPath, [gateway], {
    cwd: dir,
    env: { ...process.env, PORT: String(port), CLOUD_RUN_ORIGIN_TOKEN: token, BETTER_AUTH_URL: publicOrigin },
    stdio: ["ignore", "pipe", "inherit"],
  });
  const exited = once(child, "exit");
  t.after(async () => {
    child.kill("SIGKILL");
    await exited;
  });
  await Promise.race([
    once(child.stdout, "data"),
    exited.then(() => assert.fail("Origin gateway exited during startup")),
  ]);
  const address = "http://127.0.0.1:" + port;
  for (const path of ["/", "/api/auth/get-session", "/_next/static/chunks/abcd.js", "/favicon.ico"]) {
    const unauthorized = await fetch(address + path);
    assert.equal(unauthorized.status, 403);
    assert.equal(unauthorized.headers.get("cache-control"), "no-store");
  }
  const rejected = await fetch(address, { headers: { "x-zyx-origin-token": "B".repeat(43) } });
  assert.equal(rejected.status, 403);

  const response = await fetch(address + "/api/example?q=%2F", {
    method: "PATCH",
    body: new Uint8Array(1024 * 1024),
    headers: {
      Origin: publicOrigin,
      Cookie: "session=a",
      "X-Zyx-Origin-Token": token,
      "X-Zyx-Client-IP": "198.51.100.7",
      "X-Forwarded-Host": "spoof.example",
      "X-Forwarded-For": "198.51.100.8",
      "X-Forwarded-Proto": "http",
      "X-Middleware-Subrequest": "spoof",
    },
  });
  assert.deepEqual(response.headers.getSetCookie(), ["first=a; Secure", "second=b; Secure"]);
  const received = await response.json();
  assert.equal(received.method, "PATCH");
  assert.equal(received.url, "/api/example?q=%2F");
  assert.equal(received.size, 1024 * 1024);
  assert.equal(received.hasOriginToken, false);
  assert.equal(received.headers.origin, publicOrigin);
  assert.equal(received.headers.cookie, "session=a");
  assert.equal(received.headers.host, "staging.zyxacademy.com");
  assert.equal(received.headers["x-forwarded-host"], "staging.zyxacademy.com");
  assert.equal(received.headers["x-forwarded-proto"], "https");
  assert.equal(received.headers["x-forwarded-for"], "198.51.100.7");
  assert.equal(received.headers["x-zyx-origin-token"], undefined);
  assert.equal(received.headers["x-middleware-subrequest"], undefined);

  const headers = { "X-Zyx-Origin-Token": token };
  const optimized = await fetch(address + "/_next/image?url=%2Fbrand%2Flogo.png&w=384&q=75", {
    headers: { ...headers, Cookie: "session=a", Authorization: "Bearer test", "X-Zyx-Client-IP": "198.51.100.7" },
  });
  const imageRequest = await optimized.json();
  assert.equal(imageRequest.headers.cookie, undefined);
  assert.equal(imageRequest.headers.authorization, undefined);
  assert.equal(imageRequest.headers["x-forwarded-for"], undefined);
  assert.equal((await fetch(address + "/_next/image?url=%2Fapi%2Fstorage%3Fsignature%3Dabc&w=384&q=75", { headers })).status, 400);
  const redirect = await fetch(address + "/dashboard", { headers, redirect: "manual" });
  assert.equal(redirect.status, 307);
  assert.equal(redirect.headers.get("location"), publicOrigin + "/sign-in");

  const abort = new AbortController();
  const stream = await fetch(address + "/api/stream", { headers, signal: abort.signal });
  assert.match(stream.headers.get("content-type"), /^text\/event-stream/);
  const reader = stream.body.getReader();
  assert.equal(new TextDecoder().decode((await reader.read()).value), "data: first\n\n");
  abort.abort();
  await assert.rejects(reader.read(), { name: "AbortError" });

  child.kill("SIGTERM");
  assert.deepEqual(await exited, [0, null]);
});
