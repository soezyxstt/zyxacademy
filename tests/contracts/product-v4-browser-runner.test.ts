import { expect, test } from "bun:test";
import { authenticateVerificationBrowser, captureProductV4WebState, exerciseProductV4WebState, exerciseProductV4VisualSmoke, inspectProductV4WebDocument, inspectProductV4DisplayMath, exerciseProductV4MathScroll, validateVerificationBaseUrl, validateDeployedVerificationBaseUrl, resolveVerificationBaseUrl, isLocalPlaywrightVerification, waitForProductV4Visuals } from "@/lib/compute/product-v4-browser-runner";
import type { Page } from "@playwright/test";
import { verificationPreviewSchema } from "@/lib/materials/verification-preview";
import { visualSpecSchema } from "@/lib/materials/visual-contract";

test("scene verification waits for the mounted SVG and controls before capture or actions", async () => {
  const visual = visualSpecSchema.parse({ id: "scene", kind: "interactive_scene", label: "Scene", description: "Scene", viewBox: { x: 0, y: 0, width: 20, height: 20 }, parameters: [{ id: "x", label: "X", min: 0, max: 1, step: 1, initial: 0, control: "range" }], shapes: [{ type: "circle", cx: "x", cy: 1, r: 1 }], staticFallback: { type: "text", summary: "Fallback", content: "Fallback" } });
  let release!: () => void;
  let mounted = false, controls = false, scrolled = false, completed = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  const buttons = [{ textContent: "Reset" }, { textContent: "Tampilkan alternatif" }];
  const root = { querySelector: (selector: string) => { expect(selector).toBe(":scope > svg[role='group']"); return mounted ? {} : null; }, querySelectorAll: (selector: string) => selector === "button" ? buttons : controls ? [{}] : [] };
  Object.defineProperty(globalThis, "document", { configurable: true, value: { querySelectorAll: () => [{ id: "scene", querySelector: () => root }] } });
  try {
    const page = { locator: () => ({ all: async () => [{ scrollIntoViewIfNeeded: async () => { scrolled = true; }, getAttribute: async () => "scene" }] }), waitForFunction: async (predicate: (arg: unknown) => boolean, arg: unknown, options: { timeout: number }) => {
      expect(scrolled).toBe(true); expect(options.timeout).toBe(15000);
      expect(predicate(arg)).toBe(false);
      mounted = true;
      expect(predicate(arg)).toBe(false);
      await gate;
      expect(predicate(arg)).toBe(true);
    } } as unknown as Page;
    const waiting = waitForProductV4Visuals(page, [visual]).then(() => { completed = true; });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(completed).toBe(false);
    controls = true; release();
    await waiting;
    expect(completed).toBe(true);
    const failed = { ...page, waitForFunction: async () => { throw new Error("timeout"); } } as unknown as Page;
    await expect(waitForProductV4Visuals(failed, [visual])).rejects.toThrow("VERIFICATION_INTERACTIVE_SCENE_NOT_READY:scene");
    await expect(waitForProductV4Visuals({ locator: () => ({ all: async () => [] }) } as unknown as Page, [visual])).rejects.toThrow("VERIFICATION_INTERACTIVE_SCENE_NOT_READY:scene");
    await expect(waitForProductV4Visuals({ locator: () => ({ all: async () => [] }) } as unknown as Page, [visual], false)).resolves.toBeUndefined();
  } finally {
    if (original) Object.defineProperty(globalThis, "document", original); else Reflect.deleteProperty(globalThis, "document");
  }
});

test("deployed browser target accepts only the exact authorized Zyx origins", () => {
  expect(validateDeployedVerificationBaseUrl("https://staging.zyxacademy.com")).toBe("https://staging.zyxacademy.com");
  expect(validateDeployedVerificationBaseUrl("https://www.zyxacademy.com")).toBe("https://www.zyxacademy.com");
  expect(validateDeployedVerificationBaseUrl("https://zyx-neon-migration.vercel.app")).toBe("https://zyx-neon-migration.vercel.app");
  for (const url of ["http://staging.zyxacademy.com", "https://example.com", "https://www.zyxacademy.com/redirect", "https://www.zyxacademy.com/?url=https://example.com", "https://user:secret@www.zyxacademy.com"]) expect(() => validateDeployedVerificationBaseUrl(url)).toThrow();
});

test("protected browser access stays on its origin, bounds redirects and sanitizes failures", async () => {
  const origin = "https://zyx-neon-migration.vercel.app";
  for (const scenario of ["success", "wrong-origin", "external-redirect", "loop"] as const) {
    let calls = 0, closed = false;
    const context = {
      request: { async get(url: string, options: { maxRedirects: number }) {
        calls++; expect(new URL(url).origin).toBe(origin); expect(options.maxRedirects).toBe(0);
        return { status: () => scenario === "success" ? 200 : 307, ok: () => scenario === "success", headers: () => ({ location: scenario === "external-redirect" ? "https://example.com/private-token" : "/" }) };
      } }, async close() { closed = true; },
    } as unknown as import("playwright-core").BrowserContext;
    const promise = authenticateVerificationBrowser(context, scenario === "wrong-origin" ? "https://example.com/private-token" : `${origin}/?_vercel_share=test-only`, origin);
    if (scenario === "success") { await promise; expect(calls).toBe(1); expect(closed).toBe(false); }
    else { await expect(promise).rejects.toThrow("VERIFICATION_BROWSER_ACCESS_FAILED"); expect(closed).toBe(true); expect(calls).toBe(scenario === "wrong-origin" ? 0 : scenario === "loop" ? 6 : 1); }
  }
});

test("trusted browser target is only a configured loopback origin", () => {
  expect(validateVerificationBaseUrl("http://127.0.0.1:3100")).toBe("http://127.0.0.1:3100");
  expect(validateVerificationBaseUrl("http://localhost:3100")).toBe("http://localhost:3100");
  for (const url of ["https://example.com", "file:///tmp/site", "http://127.0.0.1:3100/anything", "http://user:password@localhost:3100", "http://localhost:3100/?url=https://example.com", "http://localhost:3100/#fragment"]) expect(() => validateVerificationBaseUrl(url)).toThrow();
});

test("controlled preview validates authored parts and excludes execution and answer channels", () => {
  const payload = { type: "zyx-verification-preview.v1", title: "Limit", sections: [{ id: "section", title: "Limit", blocks: [{ id: "block", parts: [{ id: "math", kind: "math_unit", latex: "x^2", meaningMarkdown: "Square of $x$." }] }] }], visuals: [] };
  expect(verificationPreviewSchema.safeParse(payload).success).toBe(true);
  expect(verificationPreviewSchema.safeParse({ ...payload, correctAnswer: "secret" }).success).toBe(false);
  expect(verificationPreviewSchema.safeParse({ ...payload, html: "<script>alert(1)</script>" }).success).toBe(false);
  const unsafe = structuredClone(payload);
  unsafe.sections[0].blocks[0].parts[0].meaningMarkdown = "<script>alert(1)</script>";
  expect(verificationPreviewSchema.safeParse(unsafe).success).toBe(false);
  expect(verificationPreviewSchema.safeParse({ ...payload, documentScope: "a".repeat(32) }).success).toBe(true);
  for (const documentScope of ["../document", "a".repeat(31), "A".repeat(32), "a".repeat(32) + "?x=1"]) {
    expect(verificationPreviewSchema.safeParse({ ...payload, documentScope }).success).toBe(false);
  }
});

test("source preview accepts only a verified inline image adapter, never arbitrary URLs or internal identities", () => {
  const hash = "a".repeat(64);
  const image = { id: "figure", kind: "source_figure", label: "Figure", description: "Source figure", interactive: false, assetId: hash, staticFallback: { type: "text", summary: "Figure", content: "Description" }, asset: { assetId: hash, imageUrl: "data:image/png;base64,iVBORw0KGgo=", attribution: "", width: 1, height: 1 } };
  const payload = { type: "zyx-verification-preview.v1", title: "Figure", sections: [], visuals: [image], visualId: "figure" };
  expect(verificationPreviewSchema.safeParse(payload).success).toBe(true);
  expect(verificationPreviewSchema.safeParse({ ...payload, visuals: [{ ...image, asset: { ...image.asset, imageUrl: "https://example.com/private.png" } }] }).success).toBe(false);
  expect(verificationPreviewSchema.safeParse({ ...payload, visuals: [{ ...image, materialId: "private-source", sourceChecksum: hash }] }).success).toBe(false);
});

test("epsilon states operate the named tolerance slider rather than the earlier probe slider", async () => {
  let tolerance = 1;
  let probe = 0;
  const slider = (epsilon: boolean) => ({ count: async () => 1, first() { return this; }, focus: async () => {}, inputValue: async () => String(epsilon ? tolerance : probe),
    press: async (key: string) => {
      if (!epsilon) { probe++; return; }
      tolerance = key === "Home" ? 0.1 : key === "End" ? 2.2 : tolerance + 0.01;
    } });
  const page = { getByRole: (role: string, options?: { name?: string | RegExp }) => role === "button"
    ? { count: async () => (options?.name instanceof RegExp && options.name.test("Parameter")) ? 0 : 1, first() { return this; }, click: async () => { tolerance = 1; } }
    : slider(options?.name === "Toleransi epsilon") } as unknown as Page;
  expect(await exerciseProductV4WebState(page, "changed")).toBe(true);
  expect(tolerance).toBe(1.01);
  expect(probe).toBe(0);
  tolerance = 1;
  expect(await exerciseProductV4WebState(page, "reset")).toBe(true);
  expect(tolerance).toBe(1);
  expect(await exerciseProductV4WebState(page, "epsilon-minimum")).toBe(true);
  expect(tolerance).toBe(0.1);
  expect(await exerciseProductV4WebState(page, "epsilon-maximum")).toBe(true);
  expect(tolerance).toBe(2.2);
  expect(probe).toBe(0);
});

test("verification opens parameter panels before changing and resetting a graph", async () => {
  let open = false;
  let value = 2;
  const slider = { count: async () => open ? 1 : 0, first() { return this; }, focus: async () => {}, inputValue: async () => String(value), press: async () => { value += 0.25; } };
  const page = { getByRole: (role: string, options?: { name?: string | RegExp }) => {
    if (role === "slider" && options?.name === "Toleransi epsilon") return { count: async () => 0 };
    if (role === "slider") return slider;
    if ((options?.name instanceof RegExp && options.name.test("Parameter"))) return { count: async () => 1, getAttribute: async () => String(open), click: async () => { open = true; } };
    return { count: async () => 1, first() { return this; }, click: async () => { value = 2; } };
  } } as unknown as Page;
  expect(await exerciseProductV4WebState(page, "changed")).toBe(true);
  expect(open).toBe(true);
  expect(value).toBe(2.25);
  value = 2;
  expect(await exerciseProductV4WebState(page, "reset")).toBe(true);
  expect(value).toBe(2);
});

test("chapter evidence captures top middle and end with bounded cost even for very long pages", async () => {
  const offsets: number[] = [];
  const options: unknown[] = [];
  let detached = false;
  const session = { send: async (method: string, input: unknown) => { expect(method).toBe("Page.captureScreenshot"); options.push(input); return { data: Buffer.from("png").toString("base64") }; }, detach: async () => { detached = true; } };
  let height = 9000;
  const page = { context: () => ({ newCDPSession: async () => session }), viewportSize: () => ({ width: 380, height: 4000 }), evaluate: async (_callback: unknown, top?: number) => { if (top !== undefined) offsets.push(top); return height; } } as unknown as Page;
  const artifacts = await captureProductV4WebState(page, "chapter");
  expect(offsets).toEqual([0, 2500, 5000]);
  expect(options).toEqual(Array(3).fill({ format: "png", captureBeyondViewport: false }));
  expect(new Set(artifacts.map(artifact => artifact.id)).size).toBe(3);
  expect(detached).toBe(true);
  offsets.length = 0;
  height = 2_000_000;
  const long = await captureProductV4WebState(page, "chapter");
  expect(offsets).toEqual([0, 998000, 1996000]);
  expect(long).toHaveLength(3);
  offsets.length = 0;
  const visual = await captureProductV4WebState(page, "visual", 1);
  expect(offsets).toEqual([0]);
  expect(visual.map(artifact => artifact.id)).toEqual(["web-visual-0"]);
  height = 100;
  expect(await captureProductV4WebState(page, "short")).toHaveLength(1);
});

test("local Playwright targets require a nonhosted operator and cannot masquerade as Actions", () => {
  const env = { AUTHORING_VERIFICATION_BROWSER_PROVIDER: "local_playwright" };
  expect(isLocalPlaywrightVerification(env, false)).toBe(true);
  expect(resolveVerificationBaseUrl("https://www.zyxacademy.com", env, false)).toBe("https://www.zyxacademy.com");
  for (const bad of [{ ...env, GITHUB_ACTIONS: "true" }, { ...env, VERCEL: "1" }, { ...env, K_SERVICE: "worker" }, { ...env, ZYX_COMPUTE_RUNTIME: "neon" }]) expect(() => resolveVerificationBaseUrl("https://www.zyxacademy.com", bad, false)).toThrow("VERIFICATION_LOCAL_OPERATOR_REQUIRED");
  expect(() => resolveVerificationBaseUrl("https://www.zyxacademy.com", env, true)).toThrow("VERIFICATION_LOCAL_OPERATOR_REQUIRED");
  expect(() => resolveVerificationBaseUrl("https://example.com", env, false)).toThrow();
  expect(() => resolveVerificationBaseUrl("https://www.zyxacademy.com", {}, false)).toThrow();
});
test("visual smoke actually exercises each supported state from the restored baseline", async () => {
  let value = 1;
  let restored = 0;
  const exercised: string[] = [];
  const page = {} as Page;
  const observation = () => ({ issues: [] as string[], inspectedElements: 3, partCount: 0, mathCount: 2, imageCount: 0 });
  const visual = { id: "limit", kind: "epsilon_delta_graph", label: "Limit", description: "A deliberately false limit claim", bounds: { xMin: -2, xMax: 2, yMin: -2, yMax: 5 }, limitPoint: 0, limitValue: 1, defaultEpsilon: 1, defaultDelta: 0.5, functionModel: { kind: "linear", m: 1, b: 0 }, staticFallback: { type: "text", summary: "Limit", content: "Compare the claimed limit with the curve." } } as import("@/lib/materials/visual-contract").VisualSpec;
  const results = await exerciseProductV4VisualSmoke(page, visual, {
    exercise: async (_page, state) => {
      expect(value).toBe(1); exercised.push(state);
      if (!["default", "fallback"].includes(state)) value = 2;
      return true;
    },
    inspect: async () => observation(),
    restore: async () => { value = 1; restored++; },
  });
  expect(exercised).toEqual(["default", "changed", "reset", "keyboard", "epsilon-minimum", "epsilon-maximum", "resolution-limited", "fallback"]);
  expect(restored).toBe(6);
  expect(results.every(result => result.exercised && result.document.mathCount === 2)).toBe(true);
  if (visual.kind !== "epsilon_delta_graph") throw new Error("epsilon fixture required");
  const guaranteed = await exerciseProductV4VisualSmoke(page, { ...visual, limitValue: 0 }, {
    exercise: async () => true, inspect: async () => observation(), restore: async () => {},
  });
  expect(guaranteed.map(result => result.state)).not.toContain("resolution-limited");
  expect(guaranteed.map(result => result.state)).toContain("changed");
});

test("static visual smoke requires fallback evidence and never accepts an unsupported state as PASS", async () => {
  const attempted: string[] = [];
  const visual = { kind: "geometry_2d", interactive: false } as import("@/lib/materials/visual-contract").VisualSpec;
  const ports = {
    exercise: async (_page: Page, state: string) => { attempted.push(state); return state !== "fallback"; },
    inspect: async () => ({ issues: [] as string[], inspectedElements: 2, partCount: 0, mathCount: 1, imageCount: 0 }),
    restore: async () => { throw new Error("Static visual must not have interactive states"); },
  };
  await expect(exerciseProductV4VisualSmoke({} as Page, visual, ports)).rejects.toThrow("VERIFICATION_VISUAL_STATE_UNSUPPORTED:fallback");
  expect(attempted).toEqual(["default", "fallback"]);
  attempted.length = 0;
  ports.exercise = async (_page, state) => { attempted.push(state); return true; };
  expect(await exerciseProductV4VisualSmoke({} as Page, visual, ports)).toHaveLength(2);
});

test("bounded screenshots do not limit DOM checks to visible or sampled content", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  const paragraphs = Array.from({ length: 1000 }, (_, index) => ({ getBoundingClientRect: () => ({ width: index === 999 ? 500 : 300, left: 0, right: index === 999 ? 500 : 300, top: index * 100 }) }));
  Object.defineProperty(globalThis, "document", { configurable: true, value: {
    documentElement: { scrollWidth: 380, clientWidth: 380 },
    images: [{ complete: true, naturalWidth: 0 }],
    querySelector: () => null,
    querySelectorAll: (selector: string) => selector.includes("main p") ? paragraphs : selector.includes("data-part-id") ? Array(1000).fill({}) : Array(20).fill({}),
  } });
  try {
    const result = inspectProductV4WebDocument();
    expect(result.inspectedElements).toBe(1000);
    expect(result.partCount).toBe(1000);
    expect(result.mathCount).toBe(20);
    expect(result.issues).toEqual(["CONTENT_CLIPPED_BY_VIEWPORT", "IMAGE_NOT_READY"]);
    paragraphs[999].getBoundingClientRect = () => ({ width: 300, left: 0, right: 300, top: 99900 });
    expect(inspectProductV4WebDocument().issues).toEqual(["IMAGE_NOT_READY"]);
  } finally {
    if (original) Object.defineProperty(globalThis, "document", original); else Reflect.deleteProperty(globalThis, "document");
  }
});


test("normal reading rejects internal math overflow, zoom requires an accessible actual scrollport", () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const originalStyle = Object.getOwnPropertyDescriptor(globalThis, "getComputedStyle");
  const main = { tagName: "MAIN" };
  const scrollport = { tagName: "DIV", clientWidth: 300, scrollWidth: 500, tabIndex: 0, getAttribute: () => "Rumus", parentElement: main };
  const formula = { tagName: "SPAN", clientWidth: 300, scrollWidth: 300, parentElement: scrollport };
  let scrollbarWidth = "thin";
  Object.defineProperty(globalThis, "document", { configurable: true, value: { querySelectorAll: () => [formula] } });
  Object.defineProperty(globalThis, "getComputedStyle", { configurable: true, value: () => ({ overflowX: "auto", scrollbarWidth }) });
  try {
    expect(inspectProductV4DisplayMath("reading-order-and-math")).toEqual(["DISPLAY_MATH_OVERFLOW"]);
    expect(inspectProductV4DisplayMath("keyboard-and-text-zoom")).toEqual([]);
    scrollport.tabIndex = -1;
    expect(inspectProductV4DisplayMath("keyboard-and-text-zoom")).toEqual([expect.stringContaining("DISPLAY_MATH_SCROLL_INACCESSIBLE")]);
    scrollport.tabIndex = 0;
    scrollbarWidth = "none";
    expect(inspectProductV4DisplayMath("keyboard-and-text-zoom")).toEqual([expect.stringContaining("DISPLAY_MATH_SCROLL_INACCESSIBLE")]);
    scrollport.scrollWidth = 300;
    Object.defineProperty(globalThis, "getComputedStyle", { configurable: true, value: () => ({ overflowX: "visible", scrollbarWidth: "thin" }) });
    scrollport.scrollWidth = 500;
    expect(inspectProductV4DisplayMath("keyboard-and-text-zoom")).toEqual([]);
    scrollport.scrollWidth = 300;
    expect(inspectProductV4DisplayMath("reading-order-and-math")).toEqual([]);
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument); else Reflect.deleteProperty(globalThis, "document");
    if (originalStyle) Object.defineProperty(globalThis, "getComputedStyle", originalStyle); else Reflect.deleteProperty(globalThis, "getComputedStyle");
  }
});

test("zoom math scroll checks the focused container with a real keyboard action", async () => {
  const pressed: string[] = [];
  let evaluated = 0;
  let checked = false;
  const page = { locator: () => ({ all: async () => [{ evaluate: async () => ++evaluated === 1 }] }), keyboard: { press: async (key: string) => { pressed.push(key); } }, waitForFunction: async () => { checked = true; } } as unknown as Page;
  await exerciseProductV4MathScroll(page);
  expect(pressed).toEqual(["ArrowRight"]);
  expect(checked).toBe(true);
  expect(evaluated).toBe(2);
});
