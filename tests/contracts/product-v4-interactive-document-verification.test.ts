import { expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { prepareVerificationDocumentResource } from "@/lib/compute/product-v4-browser-runner";
import { interactiveDocumentSchema } from "@/lib/materials/interactive-document";
import { loadProductV4InteractiveDocumentAssets, readProductV4RuntimeFingerprint } from "@/lib/compute/product-v4-runtime-binding";
import { decodeProductV4DocumentWire, encodeProductV4DocumentWire } from "@/lib/compute/product-v4-document-wire";
import { deriveProductV4VerificationPlan, formativeDocumentFields } from "@/lib/bundle/product-v4-verification";
import { assertNoHiddenFormativeDocuments, formativeVerificationPreview, formativeVerificationResponses } from "@/lib/compute/product-v4-formative-verification";
import { buildLocalVerificationFixture } from "../../scripts/authoring/local-verification-fixture";
import { verificationArticleDocumentRoutes } from "@/lib/compute/product-v4-browser-runner";
import { mintInteractiveDocumentGrant, verifyInteractiveDocumentGrant } from "@/lib/materials/interactive-document-grant";
import { admittedFormativeVerificationFixture } from "../visual/fixtures/formative-verification-data";

mock.module("server-only", () => ({}));

test("trusted document resource binds exact bytes and keeps production sandbox headers", async () => {
  const document = Buffer.from("<!doctype html><p>Visual</p>");
  const print = await sharp({ create: { width: 2, height: 2, channels: 4, background: "white" } }).png().toBuffer();
  const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
  const visual = interactiveDocumentSchema.parse({ id: "figure", kind: "interactive_document", version: 1, label: "Visual", description: "Visual", documentSha256: digest(document), documentBytes: document.length, printSha256: digest(print), printBytes: print.length, height: 400, staticFallback: { type: "text", summary: "Visual", content: "Visual" }, printCaption: "Visual" });
  const scope = "a".repeat(32);
  const resource = await prepareVerificationDocumentResource(visual, { document, print }, scope);
  expect(resource.path).toBe(`/__zyx-verification-document/${scope}/figure/${visual.documentSha256}`);
  expect(resource.response.headers.get("content-security-policy")).toContain("sandbox allow-scripts");
  expect(resource.response.headers.get("content-security-policy")).toContain("connect-src 'none'");
  expect(resource.response.headers.get("x-content-type-options")).toBe("nosniff");
  document[0] ^= 1;
  expect(resource.document[0]).not.toBe(document[0]);
  await expect(prepareVerificationDocumentResource(visual, { document, print }, scope)).rejects.toThrow("INTERACTIVE_DOCUMENT_INTEGRITY");
  await expect(prepareVerificationDocumentResource(visual, { document: resource.document, print: document }, scope)).rejects.toThrow("INTERACTIVE_DOCUMENT_INTEGRITY");
  await expect(prepareVerificationDocumentResource(visual, undefined, scope)).rejects.toThrow("VERIFICATION_DOCUMENT_ASSET_UNAVAILABLE");
  await expect(prepareVerificationDocumentResource(visual, { document: resource.document, print }, "../invalid")).rejects.toThrow("VERIFICATION_DOCUMENT_SCOPE_INVALID");
  const badUtf8 = Buffer.from([0xff]);
  await expect(prepareVerificationDocumentResource({ ...visual, documentSha256: digest(badUtf8), documentBytes: badUtf8.length }, { document: badUtf8, print }, scope)).rejects.toThrow();
  const badPng = Buffer.from("not a png");
  await expect(prepareVerificationDocumentResource({ ...visual, printSha256: digest(badPng), printBytes: badPng.length }, { document: resource.document, print: badPng }, scope)).rejects.toThrow("INTERACTIVE_DOCUMENT_PRINT_INVALID");
});

test("current plan loads only selected verified bytes and builds exact scoped article routes", async () => {
  const document = Buffer.from("<!doctype html><p>Private HTML marker</p>");
  const print = await sharp({ create: { width: 2, height: 2, channels: 4, background: "white" } }).png().toBuffer();
  const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
  const bundle = structuredClone(buildLocalVerificationFixture().bundle);
  const article = bundle.products.find(product => product.productType === "article");
  if (!article || article.productType !== "article") throw new Error("FIXTURE_ARTICLE_REQUIRED");
  const previous = article.visuals![0];
  const spec = interactiveDocumentSchema.parse({ id: previous.id, kind: "interactive_document", version: 1, label: "Visual", description: "Visual", documentSha256: digest(document), documentBytes: document.length, printSha256: digest(print), printBytes: print.length, height: 400, staticFallback: { type: "text", summary: "Visual", content: "Visual" }, printCaption: "Visual" });
  article.visuals = [spec];
  const hash = "a".repeat(64);
  const plan = deriveProductV4VerificationPlan({ bundle, binding: { importId: "import", courseId: bundle.manifest.courseId, runId: "run", revision: 1, rendererChecksum: hash, dependencyChecksum: hash, contractChecksum: hash, playbookChecksum: hash, fontChecksum: hash, assetChecksum: hash, printProfile: "a4", policyRevision: "v1" } });
  const requirement = plan.requirements.find(check => check.target === `${article.id}/${spec.id}` && check.layer === "web")!;
  const read = async (_spec: typeof spec, kind: "document" | "print") => kind === "document" ? document : print;
  const assets = await loadProductV4InteractiveDocumentAssets({ bundle, plan, requirement }, read);
  expect(assets[spec.documentSha256].document).toEqual(new Uint8Array(document));
  document[0] ^= 1;
  expect(assets[spec.documentSha256].document[0]).not.toBe(document[0]);
  await expect(loadProductV4InteractiveDocumentAssets({ bundle, plan, requirement }, read)).rejects.toThrow("INTEGRITY");
  document[0] ^= 1;
  await expect(loadProductV4InteractiveDocumentAssets({ bundle, plan, requirement }, async (_spec, kind) => kind === "document" ? document : new Uint8Array())).rejects.toThrow("INTEGRITY");
  await expect(loadProductV4InteractiveDocumentAssets({ bundle, plan: { ...plan, contentHash: hash }, requirement }, read)).rejects.toThrow();
  const altered = structuredClone(bundle);
  altered.manifest.bundleId = "different";
  await expect(loadProductV4InteractiveDocumentAssets({ bundle: altered, plan, requirement }, read)).rejects.toThrow("CONFLICT");
  const routes = verificationArticleDocumentRoutes(article, "b".repeat(32));
  expect(routes.length).toBeGreaterThan(0);
  expect(routes.every(route => route.path.startsWith(`/api/admin/bundles/product/${"b".repeat(32)}/interactive-document?`))).toBe(true);
  expect(JSON.stringify(routes)).not.toContain("Private HTML marker");
  expect(decodeProductV4DocumentWire(encodeProductV4DocumentWire(assets))).toEqual(assets);
});

test("wire rejects malformed, oversized and noncanonical base64 before use", () => {
  const hash = "a".repeat(64);
  for (const value of ["AB==", "not padded", "AAAA%%%", "A".repeat(8 * 1024 * 1024 + 8)]) {
    expect(() => decodeProductV4DocumentWire({ [hash]: { document: value, print: "AA==" } })).toThrow();
  }
  expect(() => decodeProductV4DocumentWire(Object.fromEntries(Array.from({ length: 9 }, (_, index) => [index.toString(16).padStart(64, "0"), { document: "AA==", print: "AA==" }])))).toThrow();
  const large = "AAAA".repeat(2 * 1024 * 1024);
  expect(() => decodeProductV4DocumentWire(Object.fromEntries(Array.from({ length: 3 }, (_, index) => [index.toString(16).padStart(64, "0"), { document: large, print: "AA==" }])))).toThrow();
});

test("browser fixture is admitted and provides distinct scoped formative fields", async () => {
  const { bundle, assets } = await admittedFormativeVerificationFixture();
  const fields = formativeDocumentFields(bundle.products);
  expect(fields.map(field => field.field.startsWith("prompt:") ? "prompt" : field.field.startsWith("option:") ? "option" : field.field).sort()).toEqual(["answer", "explanation", "option", "prompt"]);
  for (const field of fields) {
    const value = assets[field.spec.documentSha256];
    await prepareVerificationDocumentResource(field.spec, value, "c".repeat(32));
  }
});


test("formative fields bind to actual reveal and only the selected public field enters preview", async () => {
  const bundle = structuredClone(buildLocalVerificationFixture().bundle);
  const article = bundle.products.find(product => product.productType === "article");
  if (!article || article.productType !== "article") throw new Error("FIXTURE_ARTICLE_REQUIRED");
  const block = article.sections.flatMap(section => section.blocks).find(item => item.formativeCheckPayload?.options?.length);
  if (!block?.formativeCheckPayload?.options || !block.parts) throw new Error("FIXTURE_FORMATIVE_REQUIRED");
  const document = Buffer.from("<!doctype html><p>hidden answer marker</p>");
  const print = await sharp({ create: { width: 2, height: 2, channels: 4, background: "white" } }).png().toBuffer();
  const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
  const spec = interactiveDocumentSchema.parse({ id: "embedded", kind: "interactive_document", version: 1, label: "Visual", description: "Visual", documentSha256: digest(document), documentBytes: document.length, printSha256: digest(print), printBytes: print.length, height: 400, staticFallback: { type: "text", summary: "Visual", content: "Visual" }, printCaption: "Visual" });
  const markdown = `\`\`\`zyx-visual\n${JSON.stringify(spec)}\n\`\`\``;
  const explanationSpec = { ...spec, id: "hidden", documentSha256: "d".repeat(64), printSha256: "e".repeat(64) };
  const explanationMarkdown = `\`\`\`zyx-visual\n${JSON.stringify(explanationSpec)}\n\`\`\``;
  block.parts.push({ id: "embedded-prompt", kind: "markdown", markdown });
  const correct = block.formativeCheckPayload.options.find(option => option.isCorrect)!;
  correct.text = markdown;
  block.formativeCheckPayload.answer = "Answer withheld";
  block.formativeCheckPayload.explanation = `Explanation\n\n${explanationMarkdown}`;
  const hash = "a".repeat(64);
  const plan = deriveProductV4VerificationPlan({ bundle, binding: { importId: "import", courseId: bundle.manifest.courseId, runId: "run", revision: 1, ...(await readProductV4RuntimeFingerprint()), dependencyChecksum: hash, assetChecksum: hash, policyRevision: "v1" } });
  const requirements = plan.requirements.filter(check => check.state === "formative-document-field");
  expect(requirements).toHaveLength(8);
  expect(new Set(requirements.map(check => check.target)).size).toBe(4);
  expect(JSON.stringify(plan)).not.toContain("hidden answer marker");
  const fields = formativeDocumentFields(bundle.products);
  const answer = fields.find(field => field.field === "answer")!;
  expect(answer.value).toContain(correct.text);
  for (const field of fields) {
    const preview = formativeVerificationPreview(field, "b".repeat(32));
    const serialized = JSON.stringify(preview);
    expect(serialized).not.toContain("Answer withheld");
    expect(serialized).not.toContain("Explanation");
    if (field.field === "answer" || field.field === "explanation") expect(serialized).not.toContain(spec.documentSha256);
    expect(serialized).not.toContain(explanationSpec.documentSha256);
  }
  expect(() => assertNoHiddenFormativeDocuments(article, { visuals: [explanationSpec] })).toThrow("VERIFICATION_FORMATIVE_PUBLIC_FIELD_REDACTED");
  const responses = formativeVerificationResponses(answer, "scoped-grant");
  const locator = { articleId: "verification", articleVersion: 1, sectionId: answer.section.id, blockId: answer.block.id };
  expect(responses.handle("reveal", "GET", locator)).toBeNull();
  expect(responses.handle("reveal", "POST", { ...locator, blockId: "wrong" })).toBeNull();
  if (block.formativeCheckPayload.evaluation) {
    expect(responses.handle("reveal", "POST", locator)).toBeNull();
    expect(responses.handle("evaluate", "POST", { ...locator, response: { kind: "choice", optionId: correct.id } })).toMatchObject({ ok: true, result: { revealAllowed: true } });
  }
  expect(responses.handle("reveal", "POST", locator)).toEqual({ answer: answer.value, explanation: block.formativeCheckPayload.explanation, visualAccess: { answer: "scoped-grant" } });
  expect(responses.revealed).toBe(true);
  const signed = mintInteractiveDocumentGrant({ userId: "verification", ...locator, field: "answer", draftId: "draft", draftChecksum: hash }, "test-secret", 1_000);
  expect(verifyInteractiveDocumentGrant(signed, "verification", "test-secret", 1_001)?.field).toBe("answer");
  expect(verifyInteractiveDocumentGrant(signed, "other", "test-secret", 1_001)).toBeNull();
  expect(verifyInteractiveDocumentGrant(signed, "verification", "wrong", 1_001)).toBeNull();
  const answerRequirement = requirements.find(requirement => requirement.target === answer.target)!;
  const read = async (_spec: typeof spec, kind: "document" | "print") => kind === "document" ? document : print;
  expect(Object.keys(await loadProductV4InteractiveDocumentAssets({ bundle, plan, requirement: answerRequirement }, read))).toEqual([spec.documentSha256]);
  await expect(loadProductV4InteractiveDocumentAssets({ bundle, plan, requirement: answerRequirement }, async () => new Uint8Array())).rejects.toThrow("INTEGRITY");
  const tampered = { ...answerRequirement, target: requirements[0].target };
  if (tampered.target !== answerRequirement.target) await expect(loadProductV4InteractiveDocumentAssets({ bundle, plan, requirement: tampered }, read)).rejects.toThrow("VERIFICATION_REQUIREMENT_INVALID");
});
