import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function probe() {
  if (process.platform !== "linux") return { linux: false, namespaces: false };
  const result = spawnSync("unshare", ["--user", "--map-root-user", "--mount", "--net", "--pid", "--fork", "true"], { timeout: 2000, stdio: "ignore", env: { PATH: "/usr/bin:/bin" } });
  return { linux: true, namespaces: result.status === 0 };
}

export function createProbeServer(capabilities = probe()) {
  return createServer((request, response) => {
    if (request.method !== "GET" || request.url !== "/health") {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({ service: "python-runtime-probe", execution: "disabled", capabilities }));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createProbeServer().listen(Number(process.env.PORT || 10000), "0.0.0.0");
}
