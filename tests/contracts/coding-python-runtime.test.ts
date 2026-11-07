import { contractChromiumPath } from "../helpers/chromium";
import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { chromium } from "playwright-core";
mock.module("server-only", () => ({}));
const { createIsolatedBrowserPythonRuntime } = await import("@/lib/coding/server-runtime");
let runtime: Awaited<ReturnType<typeof createIsolatedBrowserPythonRuntime>>;
beforeAll(async () => {
  // Synthetic fixture execution only. Service launch still requires the kernel sandbox.
  runtime = await createIsolatedBrowserPythonRuntime(await chromium.launch({ headless: true, executablePath: contractChromiumPath() }));
});
afterAll(async () => { await runtime?.close(); });
const limits = { timeoutMs: 1000, maxOutputChars: 1000 };
describe("real Python execution in isolated browser contexts", () => {
  it("runs stdin/stdout and preserves interpreter state isolation", async () => {
    const result = await runtime.execute({ code: 'secret = 42\nprint(int(input()) + 1)', stdin: "5", limits });
    expect(result.status).toBe("completed");
    expect(result.stdout).toBe("6\n");
    const next = await runtime.execute({ code: "print(secret)", stdin: "", limits });
    expect(next.status).toBe("runtime_error");
    expect(next.stderr).toContain("NameError");
  }, 60000);
  it("reports syntax errors, runtime errors and nonterminating programs", async () => {
    expect((await runtime.execute({ code: "for :", stdin: "", limits })).status).toBe("syntax_error");
    expect((await runtime.execute({ code: "print(1 / 0)", stdin: "", limits })).stderr).toContain("ZeroDivisionError");
    expect((await runtime.execute({ code: "while True: pass", stdin: "", limits: { ...limits, timeoutMs: 100 } })).status).toBe("timeout");
  }, 60000);
  it("blocks external network access and caps output", async () => {
    const result = await runtime.execute({ code: 'import js\nawait js.fetch("https://example.com/private")', stdin: "", limits });
    expect(result.status).toBe("runtime_error");
    const output = await runtime.execute({ code: 'print("x" * 10000)', stdin: "", limits });
    expect(output.truncated).toBe(true);
    expect(output.stdout.length).toBeLessThanOrEqual(limits.maxOutputChars);
  }, 60000);
});
