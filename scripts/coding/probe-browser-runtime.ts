import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { acquireSteelVerificationBrowser } from "../../lib/compute/product-v4-browser-session";
import { PYTHON_RUNTIME_ASSETS, PYTHON_RUNTIME_REVISION } from "../../lib/coding/runtime-assets";

if (process.env.RUN_CODING_BROWSER_PROBE !== "1" || process.env.CODING_BROWSER_PROVIDER !== "steel") throw new Error("CODING_BROWSER_PROBE_OPT_IN_REQUIRED");
// Bridge only public runtime resources from a local app. No authentication
// cookies, local sessions, grading responses or database data enter Steel.
const origin = "http://127.0.0.1:3000";
const session = await acquireSteelVerificationBrowser(process.env.STEEL_API_KEY ?? "");
try {
  const context = await session.browser.newContext({ serviceWorkers: "block" });
  await context.route("**/*", async (route) => {
    const request = route.request(), address = new URL(request.url());
    if (address.origin !== origin || request.method() !== "GET") return route.abort();
    if (address.pathname === "/probe") return route.fulfill({ contentType: "text/html", body: '<!doctype html><script src="/probe.js"></script>' });
    if (address.pathname === "/probe.js") return route.fulfill({ contentType: "text/javascript", body: await readFile("artifacts/coding-live/browser-runtime.js") });
    const assetPrefix = `/api/coding/runtime/${PYTHON_RUNTIME_REVISION}/`;
    const allowed = address.pathname === "/coding/runtime-frame" || address.pathname === "/coding/worker.js" || (address.pathname.startsWith(assetPrefix) && Object.hasOwn(PYTHON_RUNTIME_ASSETS, address.pathname.slice(assetPrefix.length)));
    if (!allowed) return route.abort();
    const response = await fetch(address, { redirect: "error" });
    const headers = Object.fromEntries(response.headers);
    for (const name of ["set-cookie", "content-encoding", "content-length", "transfer-encoding"]) delete headers[name];
    await route.fulfill({ status: response.status, headers, body: Buffer.from(await response.arrayBuffer()) });
  });
  const page = await context.newPage();
  await page.goto(`${origin}/probe`);
  for (const [name, code, stdin, status, stdout] of [
    ["stdin", "secret=42\nprint(int(input())+1)", "5", "completed", "6\n"],
    ["isolation", "print(secret)", "", "runtime_error", ""],
    ["timeout", "while True: pass", "", "timeout", ""],
    ["recovery", "print(7)", "", "completed", "7\n"],
  ]) {
    const result = await page.evaluate(async ({ code, stdin }) => {
      const runtime = (globalThis as unknown as { codingBrowserProbe: typeof import("../../lib/coding/browser-runtime") }).codingBrowserProbe;
      return runtime.createBrowserPythonRuntime((phase) => {
        if (phase === "running" && document.querySelector("iframe")?.getAttribute("sandbox") !== "allow-scripts") throw new Error("CODING_BROWSER_SANDBOX_CHANGED");
      }).execute({ code, stdin, limits: { timeoutMs: 100, maxOutputChars: 1000 } });
    }, { code, stdin });
    console.log(JSON.stringify({ name, status: result.status }));
    assert.equal(result.status, status, name);
    assert.equal(result.stdout, stdout, name);
  }
  await context.close();
} finally {
  await session.close();
  console.log(JSON.stringify({ name: "provider-release", passed: true }));
}
