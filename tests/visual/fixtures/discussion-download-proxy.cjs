const http = require("node:http");

const downloadPath = "/api/discussions/attachments/image-1?download=1";

function fixtureProxy(upstreamUrl, image, send = http.request) {
  const upstream = new URL(upstreamUrl);
  if (upstream.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(upstream.hostname) || upstream.username || upstream.password || upstream.pathname !== "/" || upstream.search || upstream.hash) {
    throw new Error("Discussion fixture proxy requires a loopback HTTP origin");
  }
  const upgrades = new Set();
  const handler = (request, response) => {
    if (request.method === "GET" && request.url === downloadPath) {
      response.writeHead(200, {
        "content-type": "image/png",
        "content-length": image.length,
        "content-disposition": "attachment; filename=\"gambar\"; filename*=UTF-8''soal-limit.png",
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      });
      response.end(image);
      return;
    }
    const forwarded = send({ hostname: upstream.hostname, port: upstream.port || 80, method: request.method, path: request.url, headers: request.headers }, incoming => {
      response.writeHead(incoming.statusCode, incoming.statusMessage, incoming.headers);
      incoming.on("error", error => response.destroy(error));
      incoming.pipe(response);
    });
    forwarded.on("error", () => {
      if (response.headersSent) response.destroy();
      else response.writeHead(502).end();
    });
    request.on("aborted", () => forwarded.destroy());
    request.pipe(forwarded);
  };
  handler.upgrade = (request, socket, head) => {
    if (request.method !== "GET" || request.url?.split("?", 1)[0] !== "/_next/hmr") {
      socket.destroy();
      return;
    }
    let upstreamSocket;
    const forwarded = send({ hostname: upstream.hostname, port: upstream.port || 80, method: request.method, path: request.url, headers: request.headers });
    const timer = setTimeout(() => cleanup(), 10000);
    const cleanup = () => {
      clearTimeout(timer);
      upgrades.delete(cleanup);
      forwarded.destroy();
      socket.destroy();
      if (upstreamSocket) upstreamSocket.destroy();
    };
    upgrades.add(cleanup);
    socket.on("error", cleanup);
    socket.on("close", cleanup);
    forwarded.on("error", cleanup);
    forwarded.on("response", response => { response.destroy(); cleanup(); });
    forwarded.on("upgrade", (response, connection, upstreamHead) => {
      clearTimeout(timer);
      upstreamSocket = connection;
      connection.on("error", cleanup);
      connection.on("close", cleanup);
      const headers = [];
      for (let i = 0; i < response.rawHeaders.length; i += 2) headers.push(`${response.rawHeaders[i]}: ${response.rawHeaders[i + 1]}`);
      socket.write(`HTTP/${response.httpVersion} ${response.statusCode} ${response.statusMessage}\r\n${headers.join("\r\n")}\r\n\r\n`);
      if (upstreamHead.length) socket.write(upstreamHead);
      if (head.length) connection.write(head);
      socket.pipe(connection).pipe(socket);
    });
    forwarded.end();
  };
  handler.close = () => { for (const cleanup of upgrades) cleanup(); };
  return handler;
}

module.exports = { fixtureProxy };
