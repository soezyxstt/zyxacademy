import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";

const shell = readFileSync(join(process.cwd(), "apps/desktop/dist/index.html"), "utf8");
const script = shell.match(/<script>([\s\S]+)<\/script>/)?.[1];
if (!script) throw new Error("Desktop shell script is missing");

class ElementStub {
  textContent = "";
  disabled = false;
  children: ElementStub[] = [];
  attributes = new Map<string, string>();
  classes = new Set<string>();
  handlers = new Map<string, () => unknown>();
  classList = {
    add: (...values: string[]) => values.forEach((value) => this.classes.add(value)),
    remove: (...values: string[]) => values.forEach((value) => this.classes.delete(value)),
    contains: (value: string) => this.classes.has(value),
    toggle: (value: string, force?: boolean) => {
      const enabled = force ?? !this.classes.has(value);
      if (enabled) this.classes.add(value);
      else this.classes.delete(value);
      return enabled;
    },
  };
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  addEventListener(name: string, callback: () => unknown) { this.handlers.set(name, callback); }
  appendChild(child: ElementStub) { this.children.push(child); return child; }
  querySelectorAll() { return []; }
  scrollIntoView() {}
}

type ProbeResponse = { type: string; ok: boolean };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function startShell(options: {
  online?: boolean;
  fetch?: (url: string, init: RequestInit) => Promise<ProbeResponse>;
} = {}) {
  const elements = new Map<string, ElementStub>();
  for (const match of shell.matchAll(/<[a-z][\w-]*\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const element = new ElementStub();
    element.classes = new Set(match[1].match(/class="([^"]*)"/)?.[1].split(/\s+/) ?? []);
    element.disabled = /\bdisabled\b/.test(match[1]);
    elements.set(match[2], element);
  }
  const navigator = { onLine: options.online ?? true, language: "en", userAgent: "ZyxDesktop nightly" };
  const listeners = new Map<string, () => unknown>();
  const timers = new Map<number, { callback: () => void; delay: number }>();
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const navigations: string[] = [];
  let nextTimer = 0;
  const window = {
    __TAURI__: { core: { invoke: async (command: string) => {
      if (command === "get_desktop_server_origin") return "https://staging.zyxacademy.com";
      return { items: [], totalBytes: 0 };
    } } },
    addEventListener: (name: string, callback: () => unknown) => listeners.set(name, callback),
    setTimeout: (callback: () => void, delay: number) => {
      const id = ++nextTimer;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout: (id: number) => timers.delete(id),
    location: { replace: (url: string) => navigations.push(url) },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    scrollTo: () => {},
    requestAnimationFrame: (callback: () => void) => callback(),
  };
  const document = {
    getElementById: (id: string) => elements.get(id),
    createElement: () => new ElementStub(),
    documentElement: { lang: "en", scrollTop: 0, scrollHeight: 0 },
    body: { scrollHeight: 0 },
    addEventListener: () => {},
  };
  runInNewContext(script!, {
    window, document, navigator, AbortController,
    fetch: (url: string, init: RequestInit) => {
      requests.push({ url, init });
      return options.fetch?.(url, init) ?? Promise.resolve({ type: "opaque", ok: false });
    },
  });
  return {
    navigator, timers, requests, navigations,
    element: (id: string) => elements.get(id)!,
    click: (id: string) => elements.get(id)!.handlers.get("click")?.(),
    event: (name: string) => listeners.get(name)?.(),
  };
}

async function settle() {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

describe("desktop launch connection state", () => {
  test("starts neutral while checking, then opens staging using a fresh static HEAD request", async () => {
    const probe = deferred<ProbeResponse>();
    const app = startShell({ fetch: () => probe.promise });
    await settle();
    expect(app.element("offline-indicator").textContent).toBe("");
    expect(app.element("title").textContent).toBe("Opening Zyx Academy");
    expect(app.element("library-section").classList.contains("hidden")).toBe(true);
    expect(app.element("retry-button").disabled).toBe(true);
    expect(app.navigations).toEqual([]);
    expect(app.requests).toHaveLength(1);
    expect(app.requests[0].url).toMatch(/^https:\/\/staging\.zyxacademy\.com\/favicon\.ico\?zyx-connect=\d+$/);
    expect(app.requests[0].init).toMatchObject({ method: "HEAD", mode: "no-cors", cache: "no-store", credentials: "omit" });
    probe.resolve({ type: "opaque", ok: false });
    await settle();
    expect(app.navigations).toEqual(["https://staging.zyxacademy.com/"]);
    expect(app.timers.size).toBe(0);
  });

  test("a disconnected device opens saved readings without sending a probe", async () => {
    const app = startShell({ online: false });
    await settle();
    expect(app.requests).toEqual([]);
    expect(app.navigations).toEqual([]);
    expect(app.element("offline-indicator").textContent).toBe("Offline");
    expect(app.element("library-section").classList.contains("hidden")).toBe(false);
    expect(app.element("retry-button").disabled).toBe(false);
  });

  test("an unavailable server does not claim the device is offline and allows retry", async () => {
    let attempts = 0;
    const app = startShell({ fetch: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("Network request failed");
      return { type: "opaque", ok: false };
    } });
    await settle();
    expect(app.element("offline-indicator").textContent).toBe("");
    expect(app.element("title").textContent).toBe("Zyx could not be opened");
    expect(app.navigations).toEqual([]);
    app.click("retry-button");
    await settle();
    expect(attempts).toBe(2);
    expect(app.navigations).toEqual(["https://staging.zyxacademy.com/"]);
  });

  test("an expired probe aborts, reveals saved readings, and re-enables retry", async () => {
    const app = startShell({ fetch: (_url, init) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
    }) });
    await settle();
    const timeout = [...app.timers.values()].find((timer) => timer.delay === 3500);
    expect(timeout).toBeDefined();
    timeout!.callback();
    await settle();
    expect(app.navigations).toEqual([]);
    expect(app.element("offline-indicator").textContent).toBe("");
    expect(app.element("library-section").classList.contains("hidden")).toBe(false);
    expect(app.element("retry-button").disabled).toBe(false);
    expect(app.timers.size).toBe(0);
  });

  test("choosing saved readings during launch prevents automatic navigation", async () => {
    const probe = deferred<ProbeResponse>();
    const app = startShell({ fetch: () => probe.promise });
    app.click("refresh-library-btn");
    await settle();
    expect(app.element("library-section").classList.contains("hidden")).toBe(false);
    probe.resolve({ type: "opaque", ok: false });
    await settle();
    expect(app.navigations).toEqual([]);
    expect(app.element("offline-indicator").textContent).toBe("");
    expect(app.element("title").textContent).toBe("Saved readings");
  });

  test("reconnect checks the server and keeps saved readings open", async () => {
    const probe = deferred<ProbeResponse>();
    const app = startShell({ online: false, fetch: () => probe.promise });
    app.navigator.onLine = true;
    app.event("online");
    await settle();
    expect(app.element("offline-indicator").textContent).toBe("");
    probe.resolve({ type: "opaque", ok: false });
    await settle();
    expect(app.navigations).toEqual([]);
    expect(app.element("retry-button").disabled).toBe(false);
    app.click("lang-id");
    expect(app.element("offline-indicator").textContent).toBe("");
  });

  test("a link loss during the pending probe cannot trigger a late navigation", async () => {
    const probe = deferred<ProbeResponse>();
    const app = startShell({ fetch: () => probe.promise });
    await settle();
    app.navigator.onLine = false;
    app.event("offline");
    probe.resolve({ type: "opaque", ok: false });
    await settle();
    expect(app.navigations).toEqual([]);
    expect(app.element("offline-indicator").textContent).toBe("Offline");
  });

  test("reconnect aborts the old probe and ignores its late failure after the new probe succeeds", async () => {
    const staleProbe = deferred<ProbeResponse>();
    let attempts = 0;
    const app = startShell({ fetch: async () => {
      attempts += 1;
      if (attempts === 1) return staleProbe.promise;
      return { type: "opaque", ok: false };
    } });
    await settle();
    app.navigator.onLine = false;
    app.event("offline");
    expect(app.requests[0].init.signal?.aborted).toBe(true);
    expect(app.timers.size).toBe(0);
    app.navigator.onLine = true;
    app.event("online");
    await settle();
    expect(attempts).toBe(2);
    expect(app.element("offline-indicator").textContent).toBe("");
    staleProbe.reject(new Error("Old connection closed"));
    await settle();
    expect(app.element("offline-indicator").textContent).toBe("");
    expect(app.navigations).toEqual([]);
  });

  test("a stale success cannot change the next connection's pending or failed state", async () => {
    const staleProbe = deferred<ProbeResponse>();
    const freshProbe = deferred<ProbeResponse>();
    let attempts = 0;
    const app = startShell({ fetch: () => ++attempts === 1 ? staleProbe.promise : freshProbe.promise });
    await settle();
    app.navigator.onLine = false;
    app.event("offline");
    app.navigator.onLine = true;
    app.event("online");
    await settle();
    expect(attempts).toBe(2);
    staleProbe.resolve({ type: "opaque", ok: false });
    await settle();
    expect(app.element("offline-indicator").textContent).toBe("");
    expect(app.element("retry-button").disabled).toBe(true);
    app.event("online");
    await settle();
    expect(attempts).toBe(2);
    freshProbe.reject(new Error("New connection unavailable"));
    await settle();
    expect(app.element("offline-indicator").textContent).toBe("");
    expect(app.element("retry-button").disabled).toBe(false);
    expect(app.navigations).toEqual([]);
  });
});
