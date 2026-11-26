import { afterEach, expect, mock, spyOn, test } from "bun:test";

const order: string[] = [];
let assetFailure: Error | undefined;
const planHash = "a".repeat(64), checkId = "b".repeat(64);
mock.module("@/lib/compute/runtime", () => ({ isHostedComputeRuntime: () => true }));
mock.module("@/lib/compute/product-v4-runtime-binding", () => ({
  buildProductV4RuntimeBinding() {}, readProductV4ExecutorRuntime() {}, assertProductV4RuntimeFingerprint() {},
  async loadProductV4StaticFigureAssets() { order.push("assets"); if (assetFailure) throw assetFailure; return {}; },
  async loadProductV4InteractiveDocumentAssets() { return {}; },
}));
const result = { checkId, status: "PASS" as const, expected: "synthetic", observed: "synthetic", artifacts: [] };
mock.module("@/lib/compute/product-v4-browser-runner", () => ({
  async executeBrowserProductV4Check() { order.push("browser"); return result; },
  async closeProductV4BrowserRunner() { order.push("close"); },
}));
const { executeProductV4VerificationCheck } = await import("@/lib/compute/product-v4-verification-executor");
const input = { plan: { planHash }, bundle: { manifest: {}, products: [], dependencies: [] }, requirement: { id: checkId, layer: "web" } } as unknown as Parameters<typeof executeProductV4VerificationCheck>[0];
afterEach(() => { assetFailure = undefined; order.length = 0; });

test("the hosted marker occurs after asset loading and before the unchanged browser execution", async () => {
  const lines: string[] = [];
  const spy = spyOn(console, "info").mockImplementation((line: string) => { order.push("marker"); lines.push(line); });
  try {
    expect(await executeProductV4VerificationCheck(input)).toBe(result);
    expect(order).toEqual(["assets", "marker", "browser", "close"]);
    expect(lines.map(line => JSON.parse(line))).toEqual([{ event: "product_v4.browser_start", phase: "browser_execute", planHash, checkId }]);
  } finally { spy.mockRestore(); }
});

test("pre-browser asset failure preserves the error and emits no browser-start claim", async () => {
  assetFailure = new Error("private asset failure");
  const spy = spyOn(console, "info").mockImplementation(() => {});
  try {
    await expect(executeProductV4VerificationCheck(input)).rejects.toBe(assetFailure);
    expect(order).toEqual(["assets", "close"]);
    expect(spy).not.toHaveBeenCalled();
  } finally { spy.mockRestore(); }
});
