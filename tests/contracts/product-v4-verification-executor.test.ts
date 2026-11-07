import { buildLocalVerificationFixture } from "../../scripts/authoring/local-verification-fixture";
import { afterEach, expect, test } from "bun:test";
import { executeProductV4VerificationCheck } from "@/lib/compute/product-v4-verification-executor";
import { productEntitySchema } from "@/lib/bundle/product-validator";
import { LIMIT_EPSILON_DELTA_GRAPH } from "../fixtures/product-learning/limit-epsilon-delta";

const originalFetch = globalThis.fetch;
const originalUrl = process.env.AUTHORING_VERIFICATION_RENDERER_URL, originalSecret = process.env.AUTHORING_VERIFICATION_RENDERER_SECRET;
afterEach(() => { globalThis.fetch = originalFetch; if (originalUrl === undefined) delete process.env.AUTHORING_VERIFICATION_RENDERER_URL; else process.env.AUTHORING_VERIFICATION_RENDERER_URL = originalUrl; if (originalSecret === undefined) delete process.env.AUTHORING_VERIFICATION_RENDERER_SECRET; else process.env.AUTHORING_VERIFICATION_RENDERER_SECRET = originalSecret; });
const hash = "a".repeat(64);
function article() {
  const { bundle } = buildLocalVerificationFixture();
  const product = bundle.products.find((product) => product.productType === "article");
  if (!product || product.productType !== "article") throw new Error("FIXTURE_ARTICLE_REQUIRED");
  return product;
}
function input(layer: "structure" | "model" | "web" = "web") {
  return { plan: { planHash: hash }, bundle: { manifest: { courseId: "course" }, products: [], dependencies: [] }, requirement: { id: hash, target: `article/${LIMIT_EPSILON_DELTA_GRAPH.id}`, layer, state: "default", viewport: { width: 380, height: 844 }, artifactType: "image/png" } } as unknown as Parameters<typeof executeProductV4VerificationCheck>[0];
}
const response = (mutate: Record<string, unknown> = {}) => ({ checkId: hash, status: "PASS", expected: "Expected state", observed: "Observed state", artifacts: [{ id: "screen.png", mediaType: "image/png", base64: Buffer.from("png-test-bytes").toString("base64") }], ...mutate });

test("executor runs actual structure and polynomial model checks locally", async () => {
  const structural = input("structure"); structural.bundle.products = [article()];
  const checked = await executeProductV4VerificationCheck(structural);
  expect(checked.status).toBe("PASS");
  expect(JSON.parse(new TextDecoder().decode(checked.artifacts[0].bytes)).findings).toEqual([]);
  const unmarked = structuredClone(structural);
  if (unmarked.bundle.products[0].productType === "article") unmarked.bundle.products[0].sections[0].blocks[0].parts = [{ id: "raw-notation", kind: "markdown", markdown: "Jika 0 < |x-c| < delta, ambil epsilon > 0." }];
  expect((await executeProductV4VerificationCheck(unmarked)).status).toBe("FAIL");
  const invalid = structuredClone(structural);
  if (invalid.bundle.products[0].productType === "article") invalid.bundle.products[0].sections[0].blocks[0].parts = undefined;
  await expect(executeProductV4VerificationCheck(invalid)).rejects.toThrow();
  // This partial diktat deliberately exercises the missing source boundary.
  const missingSource = input("structure"); missingSource.bundle.products = [{ productType: "diktat", sourceArticleId: "missing" }] as unknown as typeof missingSource.bundle.products;
  expect((await executeProductV4VerificationCheck(missingSource)).status).toBe("FAIL");
  const model = { ...structural, requirement: { ...input("model").requirement, target: `${structural.bundle.products[0].id}/${LIMIT_EPSILON_DELTA_GRAPH.id}` } };
  const calculated = await executeProductV4VerificationCheck(model);
  expect(calculated.status).toBe("PASS");
  const observations = JSON.parse(new TextDecoder().decode(calculated.artifacts[0].bytes)).observations;
  expect(observations).toHaveLength(3);
  expect(observations.every((item: { bound: { status: string } }) => item.bound.status === "guaranteed")).toBe(true);
  await expect(executeProductV4VerificationCheck({ ...model, requirement: { ...model.requirement, target: "missing" } })).rejects.toThrow("VISUAL_MISSING");
});

test("executor reports absent renderer as untested and rejects unsafe configured origins", async () => {
  delete process.env.AUTHORING_VERIFICATION_RENDERER_URL; delete process.env.AUTHORING_VERIFICATION_RENDERER_SECRET;
  const oldPdfUrl = process.env.DIKTAT_RENDERER_URL, oldPdfSecret = process.env.DIKTAT_RENDERER_SECRET;
  try {
    process.env.DIKTAT_RENDERER_URL = "https://pdf-only.example";
    process.env.DIKTAT_RENDERER_SECRET = "local-legacy-test-only";
    expect((await executeProductV4VerificationCheck(input())).status).toBe("NOT_TESTED");
  } finally {
    if (oldPdfUrl === undefined) delete process.env.DIKTAT_RENDERER_URL; else process.env.DIKTAT_RENDERER_URL = oldPdfUrl;
    if (oldPdfSecret === undefined) delete process.env.DIKTAT_RENDERER_SECRET; else process.env.DIKTAT_RENDERER_SECRET = oldPdfSecret;
  }
  process.env.AUTHORING_VERIFICATION_RENDERER_SECRET = "local-test-only";
  for (const endpoint of ["http://example.com", "https://user:secret@example.com", "https://example.com/?token=secret", "https://example.com/#fragment"]) {
    process.env.AUTHORING_VERIFICATION_RENDERER_URL = endpoint;
    await expect(executeProductV4VerificationCheck(input())).rejects.toThrow("URL_INVALID");
  }
});

test("executor uses configured trust boundary and validates check identity and base64", async () => {
  process.env.AUTHORING_VERIFICATION_RENDERER_URL = "http://127.0.0.1:9876"; process.env.AUTHORING_VERIFICATION_RENDERER_SECRET = "local-test-only";
  let payload = response();
  globalThis.fetch = (async (url: unknown, options?: RequestInit) => {
    expect(String(url)).toBe("http://127.0.0.1:9876/verify");
    expect(options!.redirect).toBe("error");
    expect((options!.headers as Record<string, string>).Authorization).toBe("Bearer local-test-only");
    return Response.json(payload);
  }) as typeof fetch;
  expect(new TextDecoder().decode((await executeProductV4VerificationCheck(input())).artifacts[0].bytes)).toBe("png-test-bytes");
  payload = response({ checkId: "b".repeat(64) });
  await expect(executeProductV4VerificationCheck(input())).rejects.toThrow("CHECK_MISMATCH");
  payload = response({ artifacts: [{ id: "screen", mediaType: "image/png", base64: "invalid%%%" }] });
  await expect(executeProductV4VerificationCheck(input())).rejects.toThrow("ARTIFACT_INVALID");
  for (const base64 of ["", "AB==", "not padded"]) {
    payload = response({ artifacts: [{ id: "screen", mediaType: "image/png", base64 }] });
    await expect(executeProductV4VerificationCheck(input())).rejects.toThrow("ARTIFACT_INVALID");
  }
  globalThis.fetch = Object.assign(async () => new Response("internal details", { status: 500 }), { preconnect: originalFetch.preconnect });
  await expect(executeProductV4VerificationCheck(input())).rejects.toThrow("REJECTED:500");
});
