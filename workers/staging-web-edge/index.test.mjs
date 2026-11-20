import assert from "node:assert/strict";
import test from "node:test";
import worker from "./index.mjs";

const publicUrl = "https://zyx-academy-staging-edge.test-account.workers.dev";
const runUrl = "https://zyx-academy-staging-web-123.asia-southeast3.run.app";
const env = {
  PUBLIC_ORIGIN: publicUrl,
  CLOUD_RUN_ORIGIN: runUrl,
  CLOUD_RUN_ORIGIN_TOKEN: "A".repeat(43),
};

test("production routing rejects staging origins and preserves the apex redirect", async (t) => {
  setup(t, async () => new Response("production", { headers: { "Cache-Control": "no-store" } }));
  const production = { ...env, ZYX_ENVIRONMENT: "production", PUBLIC_ORIGIN: "https://www.zyxacademy.com",
    CLOUD_RUN_ORIGIN: "https://zyx-academy-production-web-123.asia-southeast3.run.app" };
  const ctx = { waitUntil() {} };
  assert.equal((await worker.fetch(new Request("https://www.zyxacademy.com/"), production, ctx)).status, 200);
  const apex = await worker.fetch(new Request("https://zyxacademy.com/course?x=1"), production, ctx);
  assert.equal(apex.status, 308);
  assert.equal(apex.headers.get("Location"), "https://www.zyxacademy.com/course?x=1");
  assert.equal((await worker.fetch(new Request("https://www.zyxacademy.com/"), { ...production, CLOUD_RUN_ORIGIN: runUrl }, ctx)).status, 503);
  assert.equal((await worker.fetch(new Request(publicUrl), { ...env, CLOUD_RUN_ORIGIN: production.CLOUD_RUN_ORIGIN }, ctx)).status, 503);
});

function setup(t, upstream) {
  const entries = new Map();
  const puts = [];
  t.mock.method(globalThis, "fetch", upstream);
  Object.defineProperty(globalThis, "caches", {
    configurable: true,
    value: {
      default: {
        async match(key) { return entries.get(key.url)?.clone(); },
        async put(key, value) { entries.set(key.url, value); },
      },
    },
  });
  t.after(() => delete globalThis.caches);
  return {
    request(request, settings = env) {
      return worker.fetch(request, settings, { waitUntil(promise) { puts.push(promise); } });
    },
    flush() { return Promise.all(puts); },
  };
}

test("forwards application methods, streaming bodies, cookies, Origin and CSRF metadata", async t => {
  const proxy = setup(t, async (url, init) => {
    assert.equal(url, runUrl + "/api/example?x=%2F");
    assert.equal(init.redirect, "manual");
    assert.equal(init.cache, "no-store");
    assert.equal(init.headers.get("origin"), publicUrl);
    assert.equal(init.headers.get("cookie"), "trusted=session");
    assert.equal(init.headers.get("authorization"), "Bearer application-token");
    assert.equal(init.headers.get("x-forwarded-host"), null);
    assert.equal(init.headers.get("x-middleware-subrequest"), null);
    assert.equal(init.headers.get("x-drop"), null);
    assert.equal(init.headers.get("x-zyx-origin-token"), env.CLOUD_RUN_ORIGIN_TOKEN);
    assert.equal(init.headers.get("x-zyx-client-ip"), "198.51.100.7");
    const read = init.body ? await new Response(init.body).text() : "";
    assert.equal(read, ["GET", "HEAD"].includes(init.method) ? "" : "request body");

    const headers = new Headers({ "Content-Type": "text/event-stream" });
    headers.append("Set-Cookie", "a=1; Secure; HttpOnly");
    headers.append("Set-Cookie", "b=2; Secure; HttpOnly");
    return new Response(init.method === "HEAD" ? null : "data: ok\n\n", { headers });
  });

  for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
    const body = ["GET", "HEAD"].includes(method) ? undefined : new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("request body"));
        controller.close();
      },
    });
    const request = new Request(publicUrl + "/api/example?x=%2F", {
      method,
      body,
      duplex: "half",
      headers: {
        Origin: publicUrl,
        Cookie: "trusted=session",
        Authorization: "Bearer application-token",
        Connection: ", x-drop",
        "X-Drop": "hop",
        "X-Zyx-Origin-Token": "spoof",
        "X-Zyx-Client-IP": "198.51.100.27",
        "CF-Connecting-IP": "198.51.100.7",
        "X-Forwarded-Host": "invalid.example",
        "X-Middleware-Subrequest": "spoof",
      },
    });
    const response = await proxy.request(request);
    assert.equal(response.headers.get("X-Zyx-Edge-Cache"), "BYPASS");
    assert.equal(response.headers.get("Cloudflare-CDN-Cache-Control"), "no-store");
    assert.equal(response.headers.get("content-type"), "text/event-stream");
    assert.deepEqual(response.headers.getSetCookie(), ["a=1; Secure; HttpOnly", "b=2; Secure; HttpOnly"]);
    assert.equal(await response.text(), method === "HEAD" ? "" : "data: ok\n\n");
  }
});

test("caches only verified anonymous immutable Next assets", async t => {
  let originCalls = 0;
  const proxy = setup(t, async (url, init) => {
    originCalls += 1;
    const cacheControl = "public, max-age=31536000, immutable";
    const headers = { "Content-Type": "text/javascript", "Cache-Control": cacheControl };
    if (url.endsWith("/personal.js")) headers["Set-Cookie"] = "personal=true";
    if (url.endsWith("/dynamic.js")) headers.Vary = "Cookie";
    if (url.endsWith("/index.js")) headers["Content-Type"] = "text/html";
    if (url.endsWith("/temporary.js")) headers["Cache-Control"] = "public, max-age=600";
    const body = init.method === "HEAD" ? null : (init.headers.get("cookie") ?? "chunk");
    return new Response(body, { headers });
  });

  const url = publicUrl + "/_next/static/chunks/abcd1234.js";
  const first = await proxy.request(new Request(url));
  assert.equal(first.headers.get("X-Zyx-Edge-Cache"), "MISS");
  assert.equal(await first.text(), "chunk");
  await proxy.flush();
  assert.equal((await proxy.request(new Request(url))).headers.get("X-Zyx-Edge-Cache"), "HIT");
  const buildUrl = url + "?dpl=" + "a".repeat(40) + "-123-1";
  assert.equal((await proxy.request(new Request(buildUrl))).headers.get("X-Zyx-Edge-Cache"), "MISS");
  await proxy.flush();
  assert.equal((await proxy.request(new Request(buildUrl))).headers.get("X-Zyx-Edge-Cache"), "HIT");
  assert.equal((await proxy.request(new Request(buildUrl + "&x=1"))).headers.get("X-Zyx-Edge-Cache"), "BYPASS");

  for (const headers of [{ Cookie: "private=cookie" }, { Authorization: "Bearer a" }, { Range: "bytes=0-4" },
    { RSC: "1" }, { "Next-Action": "a" }, { "If-None-Match": "chunk" }]) {
    const response = await proxy.request(new Request(url, { headers }));
    assert.equal(response.headers.get("X-Zyx-Edge-Cache"), "BYPASS");
    assert.equal(await response.text(), headers.Cookie ?? "chunk");
  }

  for (const pathname of ["/_next/image?url=/foo.png", "/_next/static/chunks/abcd1234.js?x=1",
    "/api/private/report.js", "/_next/static/chunks/a%2Fb.js", "/_next/static/chunks/personal.js",
    "/_next/static/chunks/dynamic.js", "/_next/static/chunks/index.js", "/_next/static/chunks/temporary.js"]) {
    assert.equal((await proxy.request(new Request(publicUrl + pathname))).headers.get("X-Zyx-Edge-Cache"), "BYPASS");
  }
  assert.equal(originCalls, 17);
});

test("rewrites Cloud Run redirects and preserves OAuth redirects without following them", async t => {
  const oauth = "https://accounts.google.com/sign-in?state=test";
  const proxy = setup(t, async (_url, init) => {
    assert.equal(init.redirect, "manual");
    return Response.redirect(init.headers.has("cookie") ? runUrl + "/sign-in?q=1" : oauth, 302);
  });

  for (const [headers, expected] of [[{}, oauth], [{ Cookie: "session=x" }, publicUrl + "/sign-in?q=1"]]) {
    const response = await proxy.request(new Request(publicUrl, { headers }));
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("Location"), expected);
  }
});

test("passes client cancellation and starts forwarding SSE before it completes", async t => {
  const abort = new AbortController();
  let source;
  const proxy = setup(t, async (_url, init) => {
    init.signal.addEventListener("abort", () => source.error(init.signal.reason));
    return new Response(new ReadableStream({ start(controller) {
      source = controller;
      source.enqueue(new TextEncoder().encode("data: first\n\n"));
    } }), { headers: { "Content-Type": "text/event-stream" } });
  });
  const response = await proxy.request(new Request(publicUrl + "/api/zyra/chat", { signal: abort.signal }));
  const reader = response.body.getReader();
  assert.equal(new TextDecoder().decode((await reader.read()).value), "data: first\n\n");
  abort.abort();
  await assert.rejects(reader.read(), { name: "AbortError" });
});

test("rejects bad origin configuration, hosts and unsupported methods", async t => {
  const notCalled = t.mock.fn(async () => assert.fail("unexpected origin request"));
  const proxy = setup(t, notCalled);
  assert.equal((await proxy.request(new Request(publicUrl), { ...env, CLOUD_RUN_ORIGIN: "https://other.run.app" })).status, 503);
  assert.equal((await proxy.request(new Request("https://fake.example"))).status, 421);
  assert.equal((await proxy.request(new Request(publicUrl, { method: "PROPFIND" }))).status, 405);
  assert.equal((await proxy.request(new Request(publicUrl, { headers: { Upgrade: "websocket" } }))).status, 426);
  assert.equal((await proxy.request(new Request(publicUrl.replace("https:", "http:")))).status, 308);
  assert.equal(notCalled.mock.callCount(), 0);
});
