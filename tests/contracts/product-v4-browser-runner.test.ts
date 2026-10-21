import { expect, test } from "bun:test";
import { exerciseProductV4WebState, validateVerificationBaseUrl, validateDeployedVerificationBaseUrl } from "@/lib/compute/product-v4-browser-runner";
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
    ? { count: async () => 1, first() { return this; }, click: async () => { tolerance = 1; } }
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
