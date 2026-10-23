import { expect, test } from "bun:test";
import { NonRetriableError, RetryAfterError } from "inngest";
import type { Browser } from "playwright-core";
import { acquireVerificationBrowser, runVerificationBrowserOperation } from "@/lib/compute/product-v4-browser-session";

const account = "a".repeat(32), token = "private-test-token";
const sessionId = "00000000-0000-4000-8000-000000000001";
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${account}/browser-run/devtools/browser`;

test("CDP acquisition honors Retry-After and sanitizes rate-limit errors", async () => {
  for (const [header, expected] of [["45", "45"], ["60000", "60000"], [null, "25"], ["garbage", "25"]]) {
    const ports = { fetch: (async () => new Response(`Rate limit exceeded ${token}`, { status: 429, headers: header ? { "Retry-After": header } : {} })) as typeof fetch, connect: async () => { throw new Error("must not connect"); } };
    try { await acquireVerificationBrowser(account, token, ports); throw new Error("expected rejection"); }
    catch (error) {
      expect(error).toBeInstanceOf(RetryAfterError);
      expect((error as RetryAfterError).retryAfter).toBe(expected!);
      expect((error as Error).message).toBe("VERIFICATION_BROWSER_RATE_LIMITED");
    }
  }
});

test("a remote operation deadline releases the browser before propagating timeout", async () => {
  let closed = false;
  let signal: AbortSignal | undefined;
  await expect(runVerificationBrowserOperation(input => { signal = input; return new Promise<never>(() => {}); }, async () => { expect(signal?.aborted).toBe(true); closed = true; }, 5)).rejects.toThrow("VERIFICATION_BROWSER_OPERATION_TIMEOUT");
  expect(closed).toBe(true);
});

test("browser cleanup preserves the operation error and blocks success if cleanup fails", async () => {
  const close = async () => { throw new Error("CLEANUP_FAILED"); };
  await expect(runVerificationBrowserOperation(async () => { throw new Error("RENDER_FAILED"); }, close)).rejects.toThrow("RENDER_FAILED");
  await expect(runVerificationBrowserOperation(async () => "evidence", close)).rejects.toThrow("CLEANUP_FAILED");
});

test("daily quota and denied access fail without spending transient retries", async () => {
  for (const [status, body, code] of [[429, "Browser time limit exceeded for today", "DAILY_QUOTA_EXCEEDED"], [403, token, "ACCESS_DENIED"]] as const) {
    const ports = { fetch: (async () => new Response(body, { status })) as typeof fetch, connect: async () => { throw new Error("must not connect"); } };
    await expect(acquireVerificationBrowser(account, token, ports)).rejects.toBeInstanceOf(NonRetriableError);
    await expect(acquireVerificationBrowser(account, token, ports)).rejects.toThrow(`VERIFICATION_BROWSER_${code}`);
  }
});

test("cleanup terminates the remote session as well as disconnecting Playwright", async () => {
  const calls: string[] = [];
  const browser = { close: async () => { calls.push("disconnect"); } } as unknown as Browser;
  const ports = { fetch: (async (url, options) => {
    expect((options?.headers as Record<string, string>).Authorization).toBe(`Bearer ${token}`);
    calls.push(`${options?.method} ${url}`);
    return options?.method === "POST" ? Response.json({ sessionId, webSocketDebuggerUrl: `${endpoint.replace("https:", "wss:")}/${sessionId}` }) : Response.json({ status: "closing" });
  }) as typeof fetch, connect: async () => browser };
  const acquired = await acquireVerificationBrowser(account, token, ports);
  await acquired.close();
  expect(calls).toEqual([`POST ${endpoint}?keep_alive=60000`, `DELETE ${endpoint}/${sessionId}`, "disconnect"]);
});

test("connection failures release acquired capacity and cannot leak authentication", async () => {
  let released = false;
  const ports = { fetch: (async (_url, options) => {
    if (options?.method === "DELETE") { released = true; return new Response(null, { status: 204 }); }
    return Response.json({ sessionId, webSocketDebuggerUrl: `${endpoint.replace("https:", "wss:")}/${sessionId}` });
  }) as typeof fetch, connect: async () => { throw new Error(`WebSocket error Authorization: Bearer ${token}`); } };
  await expect(acquireVerificationBrowser(account, token, ports)).rejects.toThrow("VERIFICATION_BROWSER_CONNECT_FAILED");
  expect(released).toBe(true);
});

test("Browser Run acquisition accepts Cloudflare's canonical browser-rendering CDP alias", async () => {
  const canonical = `${endpoint.replace("https:", "wss:").replace("/browser-run/", "/browser-rendering/")}/${sessionId}`;
  let connected = false;
  const ports = { fetch: (async (_url, options) => options?.method === "POST" ? Response.json({ sessionId, webSocketDebuggerUrl: canonical }) : new Response(null, { status: 204 })) as typeof fetch,
    connect: async (url: string) => { expect(url).toBe(canonical); connected = true; return { close: async () => {} } as unknown as Browser; } };
  const acquired = await acquireVerificationBrowser(account, token, ports);
  await acquired.close();
  expect(connected).toBe(true);
});

test("provider WebSocket locations cannot redirect credentials to another origin", async () => {
  let connected = false, released = false;
  const ports = { fetch: (async (_url, options) => {
    if (options?.method === "DELETE") { released = true; return new Response(null, { status: 204 }); }
    return Response.json({ sessionId, webSocketDebuggerUrl: "wss://external.example/browser" });
  }) as typeof fetch, connect: async () => { connected = true; throw new Error("must not connect"); } };
  await expect(acquireVerificationBrowser(account, token, ports)).rejects.toThrow("SESSION_INVALID");
  expect(connected).toBe(false);
  expect(released).toBe(true);
});
