import { NonRetriableError, RetryAfterError } from "inngest";
import { chromium, type Browser } from "playwright-core";

export interface VerificationBrowserSession { browser: Browser; close(): Promise<void> }
interface Ports {
  fetch: typeof fetch;
  connect: typeof chromium.connectOverCDP;
}

/** Bound remote work, then release capacity before the caller writes DB/R2 evidence. */
export async function runVerificationBrowserOperation<T>(execute: (signal: AbortSignal) => Promise<T>, close: () => Promise<void>, timeoutMs = 60_000): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined, failed = false;
  try {
    return await Promise.race([execute(controller.signal), new Promise<never>((_, reject) => { timer = setTimeout(() => { const error = new Error("VERIFICATION_BROWSER_OPERATION_TIMEOUT"); controller.abort(error); reject(error); }, timeoutMs); })]);
  } catch (error) { failed = true; throw error; }
  finally {
    clearTimeout(timer);
    controller.abort();
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([close(), new Promise<never>((_, reject) => { closeTimer = setTimeout(() => reject(new Error("VERIFICATION_BROWSER_RELEASE_TIMEOUT")), 15_000); })]); }
    catch (error) { if (!failed) throw error; }
    finally { clearTimeout(closeTimer); }
  }
}

/** Acquire over HTTP so quota responses and Retry-After survive the CDP handshake. */
export async function acquireVerificationBrowser(account: string, token: string, ports: Ports = { fetch, connect: chromium.connectOverCDP.bind(chromium) }): Promise<VerificationBrowserSession> {
  if (!/^[a-f0-9]{32}$/i.test(account) || !token) throw new NonRetriableError("VERIFICATION_BROWSER_CONFIGURATION_REQUIRED");
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${account}/browser-run/devtools/browser`;
  const headers = { Authorization: `Bearer ${token}` };
  const response = await ports.fetch(`${endpoint}?keep_alive=60000`, { method: "POST", headers, redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    // Never propagate provider bodies, URLs or headers into Inngest error logs.
    const body = await response.text();
    if (response.status === 429) {
      if (/browser time limit exceeded|daily.*(?:limit|quota)|(?:limit|quota).*today/i.test(body)) throw new NonRetriableError("VERIFICATION_BROWSER_DAILY_QUOTA_EXCEEDED");
      const retry = response.headers.get("Retry-After");
      const delay = retry && /^\d+(?:\.\d+)?$/.test(retry) ? Number(retry) * 1000 : retry ? Date.parse(retry) - Date.now() : NaN;
      throw new RetryAfterError("VERIFICATION_BROWSER_RATE_LIMITED", Number.isFinite(delay) && delay > 0 ? Math.max(1000, delay) : 25_000);
    }
    if (response.status === 401 || response.status === 403) throw new NonRetriableError("VERIFICATION_BROWSER_ACCESS_DENIED");
    throw new Error(`VERIFICATION_BROWSER_ACQUIRE_FAILED:${response.status}`);
  }
  const body: unknown = await response.json();
  const session = body as { sessionId?: unknown; webSocketDebuggerUrl?: unknown };
  if (!session || typeof session.sessionId !== "string" || !/^[a-f0-9-]{36}$/i.test(session.sessionId)) throw new NonRetriableError("VERIFICATION_BROWSER_SESSION_INVALID");
  const sessionEndpoint = `${endpoint}/${session.sessionId}`;
  const release = async () => {
    const result = await ports.fetch(sessionEndpoint, { method: "DELETE", headers, redirect: "error", signal: AbortSignal.timeout(10_000) });
    if (!result.ok && result.status !== 404) throw new Error(`VERIFICATION_BROWSER_RELEASE_FAILED:${result.status}`);
  };
  try {
    const expected = sessionEndpoint.replace("https:", "wss:");
    const socket = typeof session.webSocketDebuggerUrl === "string" ? session.webSocketDebuggerUrl : "";
    // Browser Run accepts the renamed HTTP route but returns the canonical
    // browser-rendering CDP route. Both must bind the exact account/session.
    if (![expected, expected.replace("/browser-run/", "/browser-rendering/")].includes(socket)) throw new NonRetriableError("VERIFICATION_BROWSER_SESSION_INVALID");
    const browser = await ports.connect(socket, { headers, timeout: 30_000 });
    return { browser, async close() {
      // Playwright's CDP browser.close() disconnects the client. DELETE also
      // terminates the Cloudflare session instead of billing its keep-alive.
      try { await release(); }
      finally {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try { await Promise.race([browser.close(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("VERIFICATION_BROWSER_DISCONNECT_TIMEOUT")), 5000); })]); }
        finally { clearTimeout(timer); }
      }
    } };
  } catch (error) {
    await release().catch(() => {});
    // Playwright connection errors can include authentication headers.
    if (error instanceof Error && error.message === "VERIFICATION_BROWSER_SESSION_INVALID") throw error;
    throw new Error("VERIFICATION_BROWSER_CONNECT_FAILED");
  }
}
