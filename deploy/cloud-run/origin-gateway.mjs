import { spawn } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import { createServer, request as httpRequest } from "node:http";
import { connect, isIP } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";

const { CLOUD_RUN_ORIGIN_TOKEN: token, BETTER_AUTH_URL: publicUrl, PORT = "8080" } = process.env;
if (!token || !/^[A-Za-z0-9_-]{43,}$/.test(token)) {
  throw new Error("CLOUD_RUN_ORIGIN_TOKEN must contain at least 43 URL-safe characters");
}

const publicOrigin = new URL(publicUrl);
if (publicOrigin.protocol !== "https:" || publicOrigin.href !== publicOrigin.origin + "/") {
  throw new Error("BETTER_AUTH_URL must be a canonical HTTPS origin");
}

const port = Number(PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
const appPort = port === 3001 ? 3002 : 3001;
const expectedToken = Buffer.from(token);
const childEnv = { ...process.env, HOSTNAME: "127.0.0.1", PORT: String(appPort) };
delete childEnv.CLOUD_RUN_ORIGIN_TOKEN;

const hopHeaders = [
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "proxy-connection", "te", "trailer", "transfer-encoding", "upgrade",
];
const imageRequestHeaders = new Set(["accept", "accept-encoding", "if-modified-since", "if-none-match"]);

function removeHopHeaders(headers) {
  const clean = { ...headers };
  for (const name of (headers.connection ?? "").toLowerCase().split(",")) delete clean[name.trim()];
  for (const name of hopHeaders) delete clean[name];
  return clean;
}

function permitted(value) {
  if (typeof value !== "string" || value.length !== expectedToken.length) return false;
  const candidate = Buffer.from(value);
  return candidate.length === expectedToken.length && timingSafeEqual(candidate, expectedToken);
}

function reply(response, status) {
  response.writeHead(status, { "cache-control": "no-store", "content-length": "0" }).end();
}

const gateway = createServer((incoming, outgoing) => {
  if (!permitted(incoming.headers["x-zyx-origin-token"])) {
    reply(outgoing, 403);
    return;
  }

  // Only origin-form targets are valid for the standalone server.
  if (!incoming.url?.startsWith("/") || incoming.url.startsWith("//")) {
    reply(outgoing, 400);
    return;
  }

  let target;
  let pathname;
  try {
    target = new URL(incoming.url, publicOrigin);
    pathname = decodeURIComponent(target.pathname);
  } catch {
    reply(outgoing, 400);
    return;
  }
  if (target.origin !== publicOrigin.origin) {
    reply(outgoing, 400);
    return;
  }
  const isImageOptimizer = pathname.replace(/\/+$/, "") === "/_next/image";
  if (isImageOptimizer) {
    const sources = target.searchParams.getAll("url");
    const [source] = sources;
    // Never admit signed relative URLs to Next's shared on-disk image cache.
    if (sources.length !== 1 || (source.startsWith("/") && /[?#\\]|^\/\/|%3f|%23|%5c/i.test(source))) {
      reply(outgoing, 400);
      return;
    }
  }

  const headers = removeHopHeaders(incoming.headers);
  const clientIp = isImageOptimizer ? "" : headers["x-zyx-client-ip"];
  for (const name of Object.keys(headers)) {
    if ((isImageOptimizer && !imageRequestHeaders.has(name)) ||
        name === "forwarded" || name === "expect" || name === "x-real-ip" ||
        name === "x-serverless-authorization" || name.startsWith("x-forwarded-") ||
        name.startsWith("cf-") || name.startsWith("x-zyx-") || name.startsWith("x-middleware-")) {
      delete headers[name];
    }
  }
  headers.host = publicOrigin.host;
  headers["x-forwarded-host"] = publicOrigin.host;
  headers["x-forwarded-proto"] = "https";
  headers["x-forwarded-port"] = publicOrigin.port || "443";
  if (isIP(clientIp ?? "")) headers["x-forwarded-for"] = clientIp;

  const upstream = httpRequest({
    hostname: "127.0.0.1",
    port: appPort,
    path: incoming.url,
    method: incoming.method,
    headers,
  }, (response) => {
    response.on("error", (error) => outgoing.destroy(error));
    outgoing.writeHead(response.statusCode, removeHopHeaders(response.headers));
    outgoing.flushHeaders();
    response.pipe(outgoing);
  });

  incoming.on("error", (error) => upstream.destroy(error));
  outgoing.on("close", () => {
    if (!outgoing.writableFinished) upstream.destroy();
  });
  upstream.on("error", () => {
    if (outgoing.headersSent) outgoing.destroy();
    else reply(outgoing, 502);
  });
  incoming.pipe(upstream);
});

// App WebSocket clients connect to the realtime and Python Workers directly.
gateway.on("upgrade", (_request, socket) => socket.destroy());
gateway.on("connect", (_request, socket) => socket.destroy());

const child = spawn(process.execPath, ["server.js"], { env: childEnv, stdio: "inherit" });
let stopping = false;
let startupDeadline;

child.on("error", () => process.exit(1));
child.on("exit", (code) => process.exit(stopping ? (code ?? 0) : (code || 1)));

function stop() {
  if (stopping) return;
  stopping = true;
  clearTimeout(startupDeadline);
  gateway.close(() => child.kill("SIGTERM"));
  setTimeout(() => {
    gateway.closeAllConnections();
    child.kill("SIGTERM");
  }, 7500).unref();
  setTimeout(() => child.kill("SIGKILL"), 9000).unref();
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

function acceptsConnections() {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port: appPort });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

startupDeadline = setTimeout(() => {
  console.error("Standalone server did not bind its loopback port");
  child.kill("SIGTERM");
}, 220_000).unref();

while (!stopping && !(await acceptsConnections())) await sleep(100);
clearTimeout(startupDeadline);
if (!stopping) gateway.listen(port, "0.0.0.0", () => console.log(`Origin gateway listening on port ${port}`));
