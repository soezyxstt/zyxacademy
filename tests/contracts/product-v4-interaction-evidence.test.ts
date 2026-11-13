import { expect, test } from "bun:test";
import type { Locator } from "playwright-core";
import { documentInteractionSnapshot, executeFormativeDocumentCheck, waitForDocumentInteraction } from "@/lib/compute/product-v4-formative-verification";
import { interactionFixture } from "../visual/fixtures/product-v4-interaction-verification";
import type { Page } from "playwright-core";

test("interaction evidence ignores focus and no-op, observes pixels or accessible state, and verifies reset", async () => {
  let pixel = 0, pressed = "false", focus = false;
  const canvas = { width: 10000, height: 10000 };
  const button = { getAttribute: (name: string) => name === "aria-pressed" ? pressed : null };
  const fakeDocument = {
    body: { textContent: "Rotate", get innerHTML() { return `<button class="${focus ? "focused" : ""}">Rotate</button>`; } },
    querySelectorAll: (selector: string) => selector === "canvas" ? [canvas] : selector.startsWith("[aria-") ? [button] : [],
    createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage: () => {}, getImageData: () => ({ data: new Uint8ClampedArray([pixel, 0, 0, 255]) }) }) }),
  };
  const old = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: fakeDocument });
  const body = { evaluate: async (callback: (element: unknown) => unknown) => callback(fakeDocument.body) } as unknown as Locator;
  try {
    const initial = await documentInteractionSnapshot(body);
    focus = true;
    expect(await waitForDocumentInteraction(body, initial, true)).toBe(false);
    setTimeout(() => { pixel = 255; }, 120);
    expect(await waitForDocumentInteraction(body, initial, true)).toBe(true);
    expect(fakeDocument.body.textContent).toBe("Rotate");
    pixel = 0;
    expect(await waitForDocumentInteraction(body, initial, false)).toBe(true);
    pressed = "true";
    expect(await waitForDocumentInteraction(body, initial, true)).toBe(true);
    expect(await waitForDocumentInteraction(body, initial, false)).toBe(false);
    const restoration = setTimeout(() => { pressed = "false"; }, 20);
    expect(await waitForDocumentInteraction(body, initial, false)).toBe(false);
    clearTimeout(restoration);
    pressed = "false";
    expect(await waitForDocumentInteraction(body, initial, false)).toBe(true);
    setTimeout(() => { pixel = 255; }, 180);
    expect(await waitForDocumentInteraction(body, initial, false)).toBe(false);
  } finally {
    if (old) Object.defineProperty(globalThis, "document", old); else Reflect.deleteProperty(globalThis, "document");
  }
}, 15000);

test("formative verifier rejects an enabled no-op and accepts an asynchronously changed control", async () => {
  for (const working of [false, true]) {
    const { field, assets } = await interactionFixture(working ? "canvas" : "noop");
    let pixel = 0, mounted = false;
    const routes: Array<{ match: (url: URL) => boolean; handler: (route: unknown) => Promise<unknown> }> = [];
    const scope = "b".repeat(32), baseUrl = "http://fixture.test";
    const query = new URLSearchParams({ courseId: "verification", articleId: "verification", articleVersion: "1", sectionId: field.section.id, blockId: field.block.id, field: "markdown", partId: "interaction-part", visualId: field.spec.id, hash: field.spec.documentSha256, kind: "document", checksum: scope });
    const url = `${baseUrl}/api/admin/bundles/product/${scope}/interactive-document?${query}`;
    const control = { isVisible: async () => true, isEnabled: async () => true, evaluate: async () => "BUTTON", getAttribute: async () => null, focus: async () => {}, press: async () => { if (working) setTimeout(() => { pixel = 1; }, 120); } };
    const body = { waitFor: async () => {}, locator: () => ({ all: async () => [control] }), evaluate: async (callback: Function) => String(callback).includes("const canvases") ? JSON.stringify({ pixel }) : { text: "Rotate", graphics: [], controls: [], bad: false } };
    const iframe = { waitFor: async () => {}, getAttribute: async () => "allow-scripts", contentFrame: () => ({ locator: () => body }), count: async () => mounted ? 1 : 0 };
    const host = { getAttribute: async () => field.spec.id, locator: (selector: string) => selector === "iframe" ? iframe : { waitFor: async () => {} }, getByText: () => ({ count: async () => 1 }), getByRole: (_role: string, options: { name: string }) => ({ click: async () => {
      if (options.name === "Tutup visual") { mounted = false; return; }
      mounted = true; pixel = 0;
      const route = routes.find(item => item.match(new URL(url)));
      if (!route) throw new Error("FIXTURE_ROUTE_MISSING");
      await route.handler({ request: () => ({ url: () => url, method: () => "GET" }), fulfill: async () => {}, abort: async () => { throw new Error("FIXTURE_ROUTE_REJECTED"); } });
    } }) };
    const part = { getAttribute: async () => "interaction-part", locator: () => ({ nth: () => host }) };
    const page = { route: async (match: (url: URL) => boolean, handler: (route: unknown) => Promise<unknown>) => { routes.push({ match, handler }); }, evaluate: async () => {}, waitForSelector: async () => {}, locator: (selector: string) => selector === "main [data-part-id]" ? { all: async () => [part] } : {} } as unknown as Page;
    const result = executeFormativeDocumentCheck(page, baseUrl, field, assets, scope);
    if (working) expect((await result).states).toEqual(["default", "keyboard-change", "reset"]);
    else await expect(result).rejects.toThrow("VERIFICATION_VISUAL_STATE_UNSUPPORTED:keyboard-change");
  }
}, 20000);
