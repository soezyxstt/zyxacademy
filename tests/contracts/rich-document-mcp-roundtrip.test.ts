import { expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import sharp from "sharp";

mock.module("server-only", () => ({}));
// Any unexpected persistence call must fail before it can touch a real service.
mock.module("@/db", () => ({ db: new Proxy({}, { get: () => { throw new Error("UNEXPECTED_DATABASE_ACCESS"); } }) }));
mock.module("@/lib/db", () => ({ db: new Proxy({}, { get: () => { throw new Error("UNEXPECTED_DATABASE_ACCESS"); } }) }));
mock.module("@/lib/storage", () => ({ storage: new Proxy({}, { get: () => { throw new Error("UNEXPECTED_STORAGE_ACCESS"); } }) }));

const { createAuthoringMcpServer } = await import("@/lib/authoring/mcp-server");
const { issueMcpRunToken } = await import("@/lib/authoring/mcp-workflows");
const { RECOMMENDED_PLUGIN_VERSION } = await import("@/lib/authoring/mcp-playbook");
const { questionEnvelope, validatePair, productArchive, readRichDocumentPair, richDocumentCases } = await import("../visual/fixtures/rich-document-packages");
const { buildLocalVerificationFixture } = await import("../../scripts/authoring/local-verification-fixture");
const sha = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
const document = Buffer.from("<!doctype html><html><body><main>Contoh lokal</main></body></html>");
const print = await sharp({ create: { width: 2, height: 2, channels: 4, background: "white" } }).png().toBuffer();
const spec = { id: "local", kind: "interactive_document" as const, version: 1 as const, label: "Contoh lokal", description: "Contoh lokal", documentSha256: sha(document), documentBytes: document.length, printSha256: sha(print), printBytes: print.length, height: 400, staticFallback: { type: "text" as const, summary: "Contoh", content: "Keadaan awal" }, printCaption: "Keadaan awal" };
const pair = { spec, document, print };
const fence = `\`\`\`zyx-visual\n${JSON.stringify(spec)}\n\`\`\``;
const question = { id: "q", questionType: "multiple_choice", difficulty: "medium", cognitiveLevel: "apply", reasoningPattern: "direct_application", tags: [], prompt: `Apa yang diamati?\n\n${fence}`, options: ["A", "B"], correctIndices: [0], acceptableAnswers: [], explanation: "A sesuai dengan pengamatan.", ideaLinks: [{ ideaId: "published-idea", weight: 1, role: "primary" }] };

test("converter rejects corrupted bytes, missing assets and visible/hidden reuse", async () => {
  await validatePair(pair);
  await expect(validatePair({ ...pair, print: Buffer.alloc(print.length) })).rejects.toThrow();
  const draft = { schemaVersion: "question-bank-draft.v2", draftId: "draft-local", questions: [question] };
  const envelope = await questionEnvelope(draft, [pair]);
  expect(envelope.visualAssets).toHaveLength(2);
  await expect(questionEnvelope(draft, [])).rejects.toThrow("QUESTION_VISUAL_ASSETS_REQUIRED");
  await expect(questionEnvelope({ ...draft, questions: [{ ...question, explanation: fence }] }, [pair])).rejects.toThrow("QUESTION_VISUAL_DISCLOSURE");
});

test("converter builds an admitted archive only when article references exact assets", async () => {
  const fixture = buildLocalVerificationFixture().bundle;
  const products = structuredClone(fixture.products).filter(product => product.productType === "article");
  const article = products[0];
  if (!article || article.productType !== "article" || !article.visuals?.[0]) throw new Error("FIXTURE_ARTICLE_REQUIRED");
  const previousId = article.visuals[0].id;
  const articlePair = { ...pair, spec: { ...spec, id: previousId } };
  article.visuals = [articlePair.spec];
  const archive = await productArchive({ manifest: fixture.manifest, products, dependencies: [], pairs: [articlePair] });
  expect(archive.bundle.manifest.visualAssets).toHaveLength(2);
  expect(archive.bundle.products[0].productType).toBe("article");
  await expect(productArchive({ manifest: fixture.manifest, products, dependencies: [], pairs: [] })).rejects.toThrow();
});

test("real in-memory SDK serves bootstrap and both contracts without claiming unavailable agents", async () => {
  process.env.BETTER_AUTH_SECRET = "local-test-secret-at-least-thirty-two-characters";
  const principal = { userId: "local", actorId: "local", sessionId: "session", authMethod: "session" as const, scopes: ["authoring:read", "authoring:stage"] };
  const server = createAuthoringMcpServer(principal);
  const client = new Client({ name: "local-contract-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const blocked = await client.callTool({ name: "workflow.get_playbook", arguments: { skill: "zyx-product-bundle-mcp", bootstrapProtocol: 1, pluginVersion: RECOMMENDED_PLUGIN_VERSION, clientCapabilities: { independentSubagents: false, localArtifactFiles: true, pdfRendering: false } } });
    expect(blocked.isError).toBe(true);
    expect((blocked.structuredContent as any).compatibility.code).toBe("AUTHORING_MCP_CAPABILITY_MISSING");
    for (const workflow of ["idea_product", "quiz_bank"] as const) {
      const runToken = issueMcpRunToken({ workflow, courseId: "local-course", chapterId: "local-chapter" });
      const response = await client.callTool({ name: "workflow.get_contract", arguments: { runToken } });
      expect(response.isError).toBeUndefined();
      expect((response.structuredContent as any).ok).toBe(true);
      expect((response.structuredContent as any).outputs[workflow === "idea_product" ? "productBundle" : "quizDraft"]).toBeDefined();
    }
  } finally { await client.close(); await server.close(); }
});

test.each(richDocumentCases)("built pair %s matches its current source and capture", async id => {
  const actual = await readRichDocumentPair(id);
  expect(actual.spec.id).toBe(id);
  expect(sha(actual.document)).toBe(actual.spec.documentSha256);
  expect(sha(actual.print)).toBe(actual.spec.printSha256);
});
