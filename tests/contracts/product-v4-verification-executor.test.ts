import { buildLocalVerificationFixture } from "../../scripts/authoring/local-verification-fixture";
import { afterEach, expect, test } from "bun:test";
import { executeProductV4VerificationCheck } from "@/lib/compute/product-v4-verification-executor";
import { productEntitySchema } from "@/lib/bundle/product-validator";
import { LIMIT_EPSILON_DELTA_GRAPH } from "../fixtures/product-learning/limit-epsilon-delta";
import { deriveProductV4VerificationPlan, runProductV4Verification, evaluateProductV4Verification } from "@/lib/bundle/product-v4-verification";
import { visualSpecSchema } from "@/lib/materials/visual-contract";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { decodeProductV4DocumentWire } from "@/lib/compute/product-v4-document-wire";

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

test("a long Article completes real logic checks without any renderer request", async () => {
  const bundle = structuredClone(buildLocalVerificationFixture().bundle);
  bundle.products = bundle.products.filter(product => product.productType === "article");
  const long = bundle.products[0];
  if (long.productType !== "article") throw new Error("ARTICLE_REQUIRED");
  const prose = long.sections[0].blocks[0].parts!.find(part => part.kind === "markdown")!;
  if (prose.kind !== "markdown") throw new Error("PROSE_REQUIRED");
  prose.markdown += "\n\n" + "Pembaca dapat menilai tiap langkah dari asumsi dan hasil hitung. ".repeat(600);
  let networkCalls = 0;
  globalThis.fetch = (async () => { networkCalls++; throw new Error("BROWSER_NOT_ALLOWED"); }) as unknown as typeof fetch;
  const plan = deriveProductV4VerificationPlan({ bundle, binding: { importId: "import", courseId: bundle.manifest.courseId, runId: "run", revision: 1, logicChecksum: hash, dependencyChecksum: hash, contractChecksum: hash, playbookChecksum: hash, assetChecksum: hash, policyRevision: "test-logic" } });
  const authority = { signingKey: "test-only-signing-key-at-least-32-bytes", executorId: "logic-test" };
  const receipt = await runProductV4Verification(plan, authority, requirement => executeProductV4VerificationCheck({ bundle, plan, requirement }));
  expect(evaluateProductV4Verification(plan, [receipt], authority).ready).toBe(true);
  expect(networkCalls).toBe(0);
  expect(receipt.results.flatMap(result => result.artifacts).every(artifact => artifact.mediaType === "application/json")).toBe(true);
});

test("an unresolved numeric bound reports NOT_TESTED instead of PASS", async () => {
  const check = input("model");
  const product = article();
  if (product.productType !== "article") throw new Error("ARTICLE_REQUIRED");
  const visual = product.visuals![0];
  if (visual.kind !== "epsilon_delta_graph") throw new Error("MODEL_REQUIRED");
  visual.defaultEpsilon = 1e-20;
  check.bundle.products = [product];
  check.requirement.target = `${product.id}/${visual.id}`;
  const result = await executeProductV4VerificationCheck(check);
  expect(result.status).toBe("NOT_TESTED");
  expect(JSON.parse(new TextDecoder().decode(result.artifacts[0].bytes)).untested).toEqual(["EPSILON_DELTA_RESOLUTION_LIMITED"]);
});

test("Canvas expressions and control references use the existing logic validator", async () => {
  const check = input("model");
  const product = article();
  if (product.productType !== "article") throw new Error("ARTICLE_REQUIRED");
  const visual = visualSpecSchema.parse({ id: "canvas", kind: "learning_canvas", label: "Grafik", description: "Hubungan kuadrat.", canvas: {
    version: "zyra-learning-canvas-v1", type: "function_plot", title: "Hubungan kuadrat", purpose: "Menilai hasil fungsi.", variables: [{ id: "a", label: "Koefisien", min: 0, max: 4, defaultValue: 1 }],
    controls: [{ variableId: "a", label: "Koefisien", min: 0, max: 4, step: 1 }], claimRefs: ["claim"], altText: "Grafik fungsi kuadrat.",
    fallback: { summary: "Tabel hasil fungsi.", columns: [{ id: "x", label: "$x$" }, { id: "y", label: "$y$" }], rows: [["0", "0"], ["1", "1"]] },
    domain: { min: -2, max: 2, sampleCount: 20 }, series: [{ id: "f", label: "$f(x)$", expression: "a*x^2" }],
  } });
  product.visuals = [visual];
  check.bundle.products = [product];
  check.requirement.target = `${product.id}/${visual.id}`;
  expect((await executeProductV4VerificationCheck(check)).status).toBe("PASS");
  if (visual.kind !== "learning_canvas" || visual.canvas.type !== "function_plot") throw new Error("CANVAS_REQUIRED");
  visual.canvas.series[0].expression = "unknown*x";
  expect((await executeProductV4VerificationCheck(check)).status).toBe("FAIL");
  visual.canvas.series[0].expression = "a*x^2";
  visual.canvas.controls[0].variableId = "missing";
  expect((await executeProductV4VerificationCheck(check)).status).toBe("FAIL");
});

test("PDF executor sends verified print bytes without transferring executable HTML", async () => {
  const document = Buffer.from("<!doctype html><p>document marker</p>");
  const print = await sharp({ create: { width: 2, height: 2, channels: 4, background: "white" } }).png().toBuffer();
  const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
  let invalid = "";
  const readDocumentAsset = async (_spec: unknown, kind: "document" | "print") => {
    if (invalid === "missing") throw new Error("MISSING");
    return invalid === kind ? new Uint8Array([1]) : kind === "document" ? document : print;
  };
  const { bundle } = buildLocalVerificationFixture();
  const article = bundle.products.find(product => product.productType === "article");
  if (!article || article.productType !== "article") throw new Error("FIXTURE_ARTICLE_REQUIRED");
  article.visuals = [{ id: article.visuals![0].id, kind: "interactive_document", version: 1, label: "Visual", description: "Visual", documentSha256: digest(document), documentBytes: document.length, printSha256: digest(print), printBytes: print.length, height: 400, staticFallback: { type: "text", summary: "Visual", content: "Visual" }, printCaption: "Visual" }];
  const plan = deriveProductV4VerificationPlan({ bundle, binding: { importId: "import", courseId: bundle.manifest.courseId, runId: "run", revision: 1, purpose: "pdf", rendererChecksum: hash, dependencyChecksum: hash, contractChecksum: hash, playbookChecksum: hash, fontChecksum: hash, assetChecksum: hash, printProfile: "a4", policyRevision: "v1" } });
  const requirement = plan.requirements.find(check => check.layer === "print")!;
  process.env.AUTHORING_VERIFICATION_RENDERER_URL = "http://127.0.0.1:9876"; process.env.AUTHORING_VERIFICATION_RENDERER_SECRET = "local-test-only";
  let calls = 0;
  globalThis.fetch = (async (_url: unknown, options?: RequestInit) => {
    calls++;
    const body = JSON.parse(String(options!.body));
    expect(decodeProductV4DocumentWire(body.interactiveDocumentAssets)).toEqual({});
    expect(body.staticFigureAssets[`interactive_document:${digest(print)}`].base64).toBe(print.toString("base64"));
    return Response.json(response({ checkId: requirement.id }));
  }) as typeof fetch;
  expect((await executeProductV4VerificationCheck({ bundle, plan, requirement }, readDocumentAsset)).status).toBe("PASS");
  for (invalid of ["missing", "print"]) await expect(executeProductV4VerificationCheck({ bundle, plan, requirement }, readDocumentAsset)).rejects.toThrow();
  expect(calls).toBe(1);
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
  const { bundle } = buildLocalVerificationFixture();
  const plan = deriveProductV4VerificationPlan({ bundle, binding: { importId: "import", courseId: bundle.manifest.courseId, runId: "run", revision: 1, purpose: "pdf", rendererChecksum: hash, dependencyChecksum: hash, contractChecksum: hash, playbookChecksum: hash, fontChecksum: hash, assetChecksum: hash, printProfile: "a4", policyRevision: "v1" } });
  const requirement = plan.requirements.find(check => check.layer === "print")!;
  const check = { bundle, plan, requirement };
  let payload = response({ checkId: requirement.id });
  globalThis.fetch = (async (url: unknown, options?: RequestInit) => {
    expect(String(url)).toBe("http://127.0.0.1:9876/verify");
    expect(options!.redirect).toBe("error");
    expect((options!.headers as Record<string, string>).Authorization).toBe("Bearer local-test-only");
    return Response.json(payload);
  }) as typeof fetch;
  expect(new TextDecoder().decode((await executeProductV4VerificationCheck(check)).artifacts[0].bytes)).toBe("png-test-bytes");
  payload = response({ checkId: "b".repeat(64) });
  await expect(executeProductV4VerificationCheck(check)).rejects.toThrow("CHECK_MISMATCH");
  payload = response({ artifacts: [{ id: "screen", mediaType: "image/png", base64: "invalid%%%" }] });
  payload.checkId = requirement.id;
  await expect(executeProductV4VerificationCheck(check)).rejects.toThrow("ARTIFACT_INVALID");
  for (const base64 of ["", "AB==", "not padded"]) {
    payload = response({ checkId: requirement.id, artifacts: [{ id: "screen", mediaType: "image/png", base64 }] });
    await expect(executeProductV4VerificationCheck(check)).rejects.toThrow("ARTIFACT_INVALID");
  }
  globalThis.fetch = Object.assign(async () => new Response("internal details", { status: 500 }), { preconnect: originalFetch.preconnect });
  await expect(executeProductV4VerificationCheck(check)).rejects.toThrow("REJECTED:500");
});
