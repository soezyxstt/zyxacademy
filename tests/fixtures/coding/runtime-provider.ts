import { expect, test, mock } from "bun:test";

const testEnv: Record<string, string | undefined> = process.env;
mock.module("server-only", () => ({}));
const calls: string[] = [];
let sandbox: boolean | undefined;
let failAcquire = false, failRelease = false;
const browser = { close: async () => { calls.push("disconnect"); } };
mock.module("playwright-core", () => ({ chromium: { launch: async (options: { chromiumSandbox?: boolean }) => { sandbox = options.chromiumSandbox; calls.push("launch"); return browser; } } }));
const session = () => ({ browser, close: async () => { calls.push("release"); if (failRelease) throw new Error("synthetic-private-url"); } });
mock.module("@/lib/compute/product-v4-browser-session", () => ({
  acquireSteelVerificationBrowser: async () => { calls.push("steel"); if (failAcquire) throw new Error("synthetic-private-url"); return session(); },
  acquireVerificationBrowser: async () => { calls.push("cloudflare"); return session(); },
}));
const { createTrustedPythonRuntime, createIsolatedBrowserPythonRuntime } = await import("@/lib/coding/server-runtime");
// Run this fixture in its own process. No credentials or network are used.
test("Submit selects only its provider and retains session release", async () => {
  const original = { NODE_ENV: process.env.NODE_ENV, CODING_BROWSER_PROVIDER: process.env.CODING_BROWSER_PROVIDER };
  try {
    for (const provider of ["steel", "cloudflare"]) {
      calls.length = 0; process.env.CODING_BROWSER_PROVIDER = provider;
      const runtime = await createTrustedPythonRuntime(); await runtime.close();
      expect(calls).toEqual([provider, "release"]);
    }
    calls.length = 0; process.env.CODING_BROWSER_PROVIDER = "steel"; failAcquire = true;
    await expect(createTrustedPythonRuntime()).rejects.toThrow("CODING_RUNTIME_UNAVAILABLE");
    expect(calls).toEqual(["steel"]);
    failAcquire = false; failRelease = true; calls.length = 0;
    const failedRelease = await createTrustedPythonRuntime();
    await expect(failedRelease.close()).rejects.toThrow("CODING_RUNTIME_RELEASE_FAILED");
    expect(calls).toEqual(["steel", "release"]); failRelease = false;
    calls.length = 0; delete process.env.CODING_BROWSER_PROVIDER;
    testEnv.NODE_ENV = "production";
    const production = await createTrustedPythonRuntime(); await production.close();
    expect(calls).toEqual(["cloudflare", "release"]);
    calls.length = 0; process.env.CODING_BROWSER_PROVIDER = "local";
    await expect(createTrustedPythonRuntime()).rejects.toThrow("CODING_RUNTIME_UNAVAILABLE");
    expect(calls).toEqual([]);
    testEnv.NODE_ENV = "development"; delete process.env.CODING_BROWSER_PROVIDER;
    const local = await createTrustedPythonRuntime(); await local.close();
    expect(sandbox).toBe(true); expect(calls).toEqual(["launch", "disconnect"]);
    calls.length = 0; process.env.CODING_BROWSER_PROVIDER = "invalid";
    await expect(createTrustedPythonRuntime()).rejects.toThrow("CODING_RUNTIME_UNAVAILABLE");
    expect(calls).toEqual([]);
  } finally {
    for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test("abort settles and closes once when remote CDP setup never rejects", async () => {
  let closed = 0;
  const runtime = await createIsolatedBrowserPythonRuntime({
    newContext: async () => ({
      setDefaultTimeout() {},
      route: () => new Promise(() => {}),
      close: async () => { closed++; },
    }),
  } as never, async () => {});
  const controller = new AbortController();
  const pending = runtime.execute({ code: "print(1)", stdin: "", limits: { timeoutMs: 1000, maxOutputChars: 1000 }, signal: controller.signal });
  const timer = setTimeout(() => controller.abort(), 20);
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([pending, new Promise<never>((_, reject) => { deadline = setTimeout(() => reject(new Error("Abort did not settle")), 1000); })]);
    expect(result.status).toBe("stopped");
    expect(closed).toBe(1);
  } finally { clearTimeout(timer); clearTimeout(deadline); await runtime.close(); }
});
