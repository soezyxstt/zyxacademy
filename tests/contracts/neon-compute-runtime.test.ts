import { expect, mock, test } from "bun:test";
import { RetryAfterError } from "inngest";
import { isHostedComputeRuntime } from "@/lib/compute/runtime";
import { readProductV4RuntimeFingerprint } from "@/lib/compute/product-v4-runtime-binding";

test("Neon uses its exact embedded verification identity and rejects missing or malformed identity", async () => {
  const original = { runtime: process.env.ZYX_COMPUTE_RUNTIME, build: process.env.ZYX_COMPUTE_BUILD_RUNTIME };
  try {
    process.env.ZYX_COMPUTE_RUNTIME = "neon";
    expect(isHostedComputeRuntime()).toBe(true);
    delete process.env.ZYX_COMPUTE_BUILD_RUNTIME;
    await expect(readProductV4RuntimeFingerprint()).rejects.toThrow();
    const fingerprint = { rendererChecksum: "a".repeat(64), fontChecksum: "b".repeat(64), contractChecksum: "c".repeat(64), playbookChecksum: "d".repeat(64), printProfile: "fixed-a4" };
    process.env.ZYX_COMPUTE_BUILD_RUNTIME = JSON.stringify(fingerprint);
    expect(await readProductV4RuntimeFingerprint()).toEqual(fingerprint);
    process.env.ZYX_COMPUTE_BUILD_RUNTIME = JSON.stringify({ ...fingerprint, fontChecksum: "wrong" });
    await expect(readProductV4RuntimeFingerprint()).rejects.toThrow("PRODUCT_V4_BUILD_RUNTIME_INVALID");
  } finally {
    if (original.runtime === undefined) delete process.env.ZYX_COMPUTE_RUNTIME; else process.env.ZYX_COMPUTE_RUNTIME = original.runtime;
    if (original.build === undefined) delete process.env.ZYX_COMPUTE_BUILD_RUNTIME; else process.env.ZYX_COMPUTE_BUILD_RUNTIME = original.build;
  }
});

test("Neon PDF reads retain page errors and retriable provider identity across CDP", async () => {
  let failure: Error = new Error("page.evaluate: Error: AUTHORING_MCP_SOURCE_PAGE_INVALID");
  mock.module("@/lib/compute/browser-pdf", () => ({ parseBrowserPdfPages: async () => { throw failure; } }));
  const { parseStoredPdfPages } = await import("@/lib/compute/pdf-pages");
  const runtime = process.env.ZYX_COMPUTE_RUNTIME;
  process.env.ZYX_COMPUTE_RUNTIME = "neon";
  try {
    await expect(parseStoredPdfPages(new Uint8Array([1]), [2])).rejects.toThrow(/^AUTHORING_MCP_SOURCE_PAGE_INVALID$/);
    failure = new RetryAfterError("VERIFICATION_BROWSER_RATE_LIMITED", 20_000);
    try { await parseStoredPdfPages(new Uint8Array([1]), [1]); throw new Error("expected failure"); }
    catch (error) { expect(error).toBe(failure); }
    failure = new Error("page.evaluate: InvalidPDFException: Invalid PDF structure");
    await expect(parseStoredPdfPages(new Uint8Array([1]), [1])).rejects.toThrow(/^AUTHORING_MCP_SOURCE_PDF_INVALID$/);
  } finally {
    if (runtime === undefined) delete process.env.ZYX_COMPUTE_RUNTIME; else process.env.ZYX_COMPUTE_RUNTIME = runtime;
  }
});
