import { expect, test } from "bun:test";
import { captureProductV4WebState, exerciseProductV4WebState, inspectProductV4DisplayMath, exerciseProductV4MathScroll, validateVerificationBaseUrl, validateDeployedVerificationBaseUrl } from "@/lib/compute/product-v4-browser-runner";
import type { Page } from "@playwright/test";
import { verificationPreviewSchema } from "@/lib/materials/verification-preview";

test("deployed browser target accepts only the exact authorized Zyx origins", () => {
  expect(validateDeployedVerificationBaseUrl("https://staging.zyxacademy.com")).toBe("https://staging.zyxacademy.com");
  expect(validateDeployedVerificationBaseUrl("https://www.zyxacademy.com")).toBe("https://www.zyxacademy.com");
  for (const url of ["http://staging.zyxacademy.com", "https://example.com", "https://www.zyxacademy.com/redirect", "https://www.zyxacademy.com/?url=https://example.com", "https://user:secret@www.zyxacademy.com"]) expect(() => validateDeployedVerificationBaseUrl(url)).toThrow();
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
    ? { count: async () => options?.name === "Parameter" ? 0 : 1, first() { return this; }, click: async () => { tolerance = 1; } }
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
    if (options?.name === "Parameter") return { count: async () => 1, getAttribute: async () => String(open), click: async () => { open = true; } };
    return { count: async () => 1, first() { return this; }, click: async () => { value = 2; } };
  } } as unknown as Page;
  expect(await exerciseProductV4WebState(page, "changed")).toBe(true);
  expect(open).toBe(true);
  expect(value).toBe(2.25);
  value = 2;
  expect(await exerciseProductV4WebState(page, "reset")).toBe(true);
  expect(value).toBe(2);
});

test("long chapter captures cover every row at the required viewport", async () => {
  const offsets: number[] = [];
  const options: unknown[] = [];
  let detached = false;
  const session = { send: async (method: string, input: unknown) => { expect(method).toBe("Page.captureScreenshot"); options.push(input); return { data: Buffer.from("png").toString("base64") }; }, detach: async () => { detached = true; } };
  const page = { context: () => ({ newCDPSession: async () => session }), viewportSize: () => ({ width: 380, height: 4000 }), evaluate: async (_callback: unknown, top?: number) => { if (top !== undefined) offsets.push(top); return 9000; } } as unknown as Page;
  const artifacts = await captureProductV4WebState(page, "chapter");
  expect(offsets).toEqual([0, 4000, 8000]);
  expect(options).toEqual(Array(3).fill({ format: "png", captureBeyondViewport: false }));
  expect(new Set(artifacts.map(artifact => artifact.id)).size).toBe(3);
  expect(detached).toBe(true);
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
    expect(inspectProductV4DisplayMath("keyboard-and-text-zoom")).toEqual(["DISPLAY_MATH_SCROLL_INACCESSIBLE"]);
    scrollport.tabIndex = 0;
    scrollbarWidth = "none";
    expect(inspectProductV4DisplayMath("keyboard-and-text-zoom")).toEqual(["DISPLAY_MATH_SCROLL_INACCESSIBLE"]);
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
