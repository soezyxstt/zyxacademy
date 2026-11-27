const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../../..");
const output = path.resolve(process.env.ONBOARDING_FIXTURE_OUT || path.join(root, "artifacts/visual-quality/onboarding-fixture"));
const publicRoot = path.join(root, "public");
const port = Number(process.env.ONBOARDING_FIXTURE_PORT || 4319);
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".webp": "image/webp", ".png": "image/png" };

http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url || "/", "http://127.0.0.1").pathname);
  const relative = pathname.replace(/^\/+/, "");
  let file;
  for (const directory of [output, publicRoot]) {
    const candidate = path.resolve(directory, relative);
    if (candidate.startsWith(directory + path.sep) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) { file = candidate; break; }
  }
  if (!file && path.extname(pathname)) { response.writeHead(404); response.end("Fixture asset not found"); return; }
  file ??= path.join(output, "index.html");
  response.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
  fs.createReadStream(file).pipe(response);
}).listen(port, "127.0.0.1", () => console.log(`Onboarding fixture: http://127.0.0.1:${port}`));
