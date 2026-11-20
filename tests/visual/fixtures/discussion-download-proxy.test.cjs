const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Duplex, PassThrough, Writable } = require("node:stream");
const { once } = require("node:events");
const { fixtureProxy } = require("./discussion-download-proxy.cjs");

function exchange(handler, method, url, body = "") {
  const request = new PassThrough();
  Object.assign(request, { method, url, headers: { host: "127.0.0.1:9999", "x-fixture": "yes" } });
  const chunks = [];
  const response = new Writable({ write(chunk, encoding, done) { chunks.push(chunk); done(); } });
  response.writeHead = function (status, message, headers) {
    this.status = status;
    this.headers = typeof message === "object" ? message : headers;
    return this;
  };
  handler(request, response);
  request.end(body);
  return once(response, "finish").then(() => ({ status: response.status, headers: response.headers, body: Buffer.concat(chunks) }));
}

test("only the exact fictional download receives private fixture bytes", async () => {
  const image = Buffer.from("fixture image");
  const forwarded = [];
  const bodies = [];
  const send = (options, callback) => {
    forwarded.push(options);
    const outgoing = new PassThrough();
    const chunks = [];
    outgoing.on("data", chunk => chunks.push(chunk));
    outgoing.on("end", () => {
      bodies.push(Buffer.concat(chunks).toString());
      const incoming = new PassThrough();
      Object.assign(incoming, { statusCode: 201, statusMessage: "Created", headers: { "x-upstream": "preserved" } });
      callback(incoming);
      incoming.end("upstream response");
    });
    return outgoing;
  };
  const handler = fixtureProxy("http://127.0.0.1:3106", image, send);
  const download = await exchange(handler, "GET", "/api/discussions/attachments/image-1?download=1");
  assert.equal(download.status, 200);
  assert.deepEqual(download.body, image);
  assert.equal(download.headers["cache-control"], "private, no-store");
  assert.equal(download.headers["x-content-type-options"], "nosniff");
  assert.match(download.headers["content-disposition"], /soal-limit\.png/);
  assert.equal(forwarded.length, 0);
  for (const [method, path] of [["POST", "/api/discussions/attachments/image-1?download=1"], ["GET", "/api/discussions/attachments/image-1?preview=1"], ["GET", "/api/discussions/attachments/image-2?download=1"], ["GET", "/visual-fixtures/discussions?state=private-image"]]) {
    const result = await exchange(handler, method, path, "body");
    assert.equal(result.status, 201);
    assert.equal(result.headers["x-upstream"], "preserved");
    assert.equal(result.body.toString(), "upstream response");
    const options = forwarded.at(-1);
    assert.equal(options.path, path);
    assert.equal(options.method, method);
    assert.equal(options.headers["x-fixture"], "yes");
    assert.equal(bodies.at(-1), "body");
  }
});

test("proxy refuses non-loopback or credential-bearing upstreams", () => {
  for (const origin of ["https://localhost:3106", "http://example.com", "http://user:secret@localhost:3106", "http://127.0.0.1:3106/path"]) {
    assert.throws(() => fixtureProxy(origin, Buffer.alloc(0)), /loopback HTTP origin/);
  }
});

function fakeSocket() {
  const chunks = [];
  const socket = new Duplex({ read() {}, write(chunk, encoding, done) { chunks.push(Buffer.from(chunk)); done(); } });
  socket.output = () => Buffer.concat(chunks).toString();
  return socket;
}

test("upgrade forwards the real handshake, both head buffers and duplex traffic", async () => {
  let options;
  let forwarded;
  const proxy = fixtureProxy("http://127.0.0.1:3106", Buffer.alloc(0), value => {
    options = value;
    forwarded = new PassThrough();
    return forwarded;
  });
  const client = fakeSocket();
  const upstream = fakeSocket();
  const headers = { host: "127.0.0.1:9999", upgrade: "websocket", connection: "Upgrade", "sec-websocket-key": "fixture-key" };
  proxy.upgrade({ method: "GET", url: "/_next/hmr?fixture=1", headers }, client, Buffer.from("client-head"));
  assert.deepEqual(options, { hostname: "127.0.0.1", port: "3106", method: "GET", path: "/_next/hmr?fixture=1", headers });
  forwarded.emit("upgrade", { httpVersion: "1.1", statusCode: 101, statusMessage: "Switching Protocols", rawHeaders: ["Connection", "Upgrade", "Upgrade", "websocket", "Sec-WebSocket-Accept", "fixture-accept"] }, upstream, Buffer.from("server-head"));
  assert.equal(client.output(), "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Accept: fixture-accept\r\n\r\nserver-head");
  assert.equal(upstream.output(), "client-head");
  client.push("client-frame");
  upstream.push("server-frame");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(upstream.output(), "client-headclient-frame");
  assert.match(client.output(), /server-headserver-frame$/);
  proxy.close();
  assert.equal(client.destroyed, true);
  assert.equal(upstream.destroyed, true);
  assert.equal(forwarded.destroyed, true);
});

test("upgrade errors, rejected handshakes and socket closure clean up both sides", async () => {
  for (const failure of ["request-error", "rejected", "client-close", "client-error", "upstream-error", "upstream-close", "shutdown"]) {
    let forwarded;
    const proxy = fixtureProxy("http://localhost:3106", Buffer.alloc(0), () => (forwarded = new PassThrough()));
    const client = fakeSocket();
    const upstream = fakeSocket();
    proxy.upgrade({ method: "GET", url: "/_next/hmr", headers: {} }, client, Buffer.alloc(0));
    if (failure === "upstream-error" || failure === "upstream-close") {
      forwarded.emit("upgrade", { httpVersion: "1.1", statusCode: 101, statusMessage: "Switching Protocols", rawHeaders: [] }, upstream, Buffer.alloc(0));
      if (failure === "upstream-error") upstream.emit("error", new Error("upstream failed"));
      else upstream.destroy();
    } else if (failure === "request-error") forwarded.emit("error", new Error("connection failed"));
    else if (failure === "rejected") {
      const response = new PassThrough();
      forwarded.emit("response", response);
      assert.equal(response.destroyed, true);
      assert.equal(client.output(), "");
    } else if (failure === "client-close") client.destroy();
    else if (failure === "client-error") client.emit("error", new Error("client failed"));
    else proxy.close();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(client.destroyed, true, failure);
    assert.equal(forwarded.destroyed, true, failure);
    if (failure === "upstream-error" || failure === "upstream-close") assert.equal(upstream.destroyed, true);
    proxy.close();
  }
});

test("upgrade rejects other methods and paths without contacting upstream", () => {
  const proxy = fixtureProxy("http://localhost:3106", Buffer.alloc(0), () => assert.fail("unexpected upstream request"));
  for (const [method, url] of [["POST", "/_next/hmr"], ["GET", "/api/discussions/attachments/image-1"], ["GET", "/_next/hmr-extra"]]) {
    const client = fakeSocket();
    proxy.upgrade({ method, url, headers: {} }, client, Buffer.alloc(0));
    assert.equal(client.destroyed, true);
  }
  proxy.close();
});
