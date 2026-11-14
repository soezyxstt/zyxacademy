import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { build } from "esbuild";
import { buildFixture } from "./fixtures/interactive-document-build";

async function runFixture(script: string, args: string[]): Promise<string> {
  const child = spawn(process.execPath, [script, ...args], { env: { ...process.env, ZYX_POSTGRES_BUILD_PLACEHOLDER: "1" }, stdio: ["ignore", "pipe", "pipe"] });
  let output = "", errors = "";
  child.stdout.setEncoding("utf8").on("data", chunk => { output += chunk; });
  child.stderr.setEncoding("utf8").on("data", chunk => { errors += chunk; });
  const [code] = await once(child, "close");
  if (code !== 0) throw new Error(`Fixture runner exited ${code}: ${errors.slice(0, 3000)}`);
  return output;
}

// One Playwright project is sufficient: the trusted runner applies both plan viewports itself.
test("admitted formative fields use scoped preview, reveal and trusted runner", async ({}, info) => {
  test.setTimeout(300_000);
  const script = info.outputPath("runner.mjs");
  await build({ entryPoints: ["tests/visual/fixtures/formative-verification-runner.ts"], outfile: script, bundle: true, platform: "node", format: "esm", packages: "external", banner: { js: "import {createRequire as fixtureRequire} from 'node:module'; const require = fixtureRequire(import.meta.url);" }, plugins: [{ name: "fixture-server-boundaries", setup(builder) {
    builder.onResolve({ filter: /^(server-only|bun:test|@\/lib\/storage)$/ }, args => ({ path: args.path, namespace: "fixture-server" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture-server" }, args => ({ contents: args.path === "bun:test" ? "export const mock={module(){}}" : args.path === "@/lib/storage" ? "export const storage={}" : "", loader: "js" }));
  } }] });
  const runtime = JSON.parse(await runFixture(script, ["runtime"]));
  const rendered = await buildFixture("tests/visual/fixtures/formative-verification.tsx", JSON.stringify(runtime));
  let server: Server | undefined;
  try {
    server = createServer((request, response) => {
      if (request.url === "/authoring-verification") return response.writeHead(200, { "Content-Type": "text/html" }).end('<!doctype html><html lang="id"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
      if (request.url === "/fixture.css") return response.writeHead(200, { "Content-Type": "text/css" }).end(rendered.styles);
      if (request.url === "/fixture.js") return response.writeHead(200, { "Content-Type": "application/javascript" }).end(rendered.script);
      return response.writeHead(404).end();
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("FIXTURE_SERVER_INVALID");
    const results = JSON.parse(await runFixture(script, [`http://127.0.0.1:${address.port}`, info.outputPath("runner")]));
    expect(results).toHaveLength(8);
    for (const result of results) {
      expect(result.status, `${result.field} ${result.width}: ${result.observed}`).toBe("PASS");
      expect(result.observed).toContain("simulated reveal");
      expect(result.paths.length).toBeGreaterThan(0);
      for (const [index, path] of result.paths.entries()) await info.attach(`${result.field}-${result.width}-${index + 1}`, { path, contentType: "image/png" });
    }
    expect(new Set(results.map((item: { field: string; width: number }) => `${item.field}-${item.width}`))).toEqual(new Set(["prompt", "option", "answer", "explanation"].flatMap(field => [380, 1536].map(width => `${field}-${width}`))));
  } finally {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  }
});
