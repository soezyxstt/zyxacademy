import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { sharedUiRelativeCases } from "../../packages/native-parity/shared-ui/relative-cases";
import { sharedUiReferenceScript } from "../../apps/mobile-native/features/shared-ui/reference-ready";

const build = "a".repeat(40);
const fixture = sharedUiRelativeCases.find(item => item.id === "shared-dialog-validation-light")!;

test("the twelve gated Shared UI components each have exactly three fixture cases", () => {
  const groups = new Map<string, number>();
  for (const item of sharedUiRelativeCases) groups.set(item.component, (groups.get(item.component) ?? 0) + 1);
  expect(groups.size).toBe(12);
  expect([...groups.values()]).toEqual(Array(12).fill(3));
});

async function signals(
  checks: { build?: string; width?: number; dialog?: boolean; validation?: boolean; hideNav?: boolean } = {},
  target: (typeof sharedUiRelativeCases)[number] = fixture,
) {
  const uri = "http://127.0.0.1:3211/" + target.id;
  const script = sharedUiReferenceScript(target, uri, build, 380, 752);
  const messages: string[] = [];
  const dialog = { getClientRects: () => [1] };
  const alert = { ...dialog, textContent: "Alasan wajib diisi." };
  runInNewContext(script, {
    requestAnimationFrame: queueMicrotask,
    setTimeout: queueMicrotask,
    getComputedStyle: () => ({ visibility: "visible", opacity: 1 }),
    document: {
      fonts: { ready: Promise.resolve(), load: async () => [{ status: "loaded" }] },
      documentElement: { lang: "id", classList: { contains: (theme: string) => theme === target.theme },
        dataset: { hydrated: "true" }, scrollWidth: 380 },
      body: { innerText: "Konten" },
      images: [],
      querySelector: () => ({
        dataset: { reference: target.id, sharedBuild: checks.build ?? build },
        querySelectorAll: (selector: string) => selector === "[data-mobile-bottom-nav]" && !checks.hideNav ? [dialog] : [],
      }),
      querySelectorAll: (selector: string) => selector === '[role="dialog"]' && checks.dialog !== false ? [dialog]
        : selector === '[role="alert"]' && checks.validation !== false ? [alert] : [],
    },
    location: { href: uri },
    devicePixelRatio: 1, innerWidth: checks.width ?? 380, innerHeight: 752, scrollY: 0,
    visualViewport: { width: 380, height: 752, scale: 1 },
    Intl: { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: "Asia/Jakarta" }) }) },
    window: { ReactNativeWebView: { postMessage: (message: string) => messages.push(message) } },
  });
  await new Promise(resolve => setImmediate(resolve));
  return messages;
}

test("the WebView marker rejects wrong build, geometry and missing dialog validation", async () => {
  expect(await signals()).toEqual(["shared-ui-ready:" + fixture.id]);
  for (const checks of [{ build: "b".repeat(40) }, { width: 381 }, { dialog: false }, { validation: false }]) {
    expect(await signals(checks)).toEqual([]);
  }
});

test("the Admin bottom navigation case requires the real visible navigation", async () => {
  const admin = sharedUiRelativeCases.find(item => item.id === "bottom-navigation-admin-dark")!;
  expect(await signals({}, admin)).toEqual(["shared-ui-ready:" + admin.id]);
  expect(await signals({ hideNav: true }, admin)).toEqual([]);
});
