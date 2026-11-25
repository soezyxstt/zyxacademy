import { expect, test } from "bun:test";
import { createProductDraft, type CreateProductDraftRequest, type ProductDraftCreationPorts } from "@/lib/authoring/product-draft-service";
import { issueMcpBootstrapToken } from "@/lib/authoring/mcp-workflows";
import { validateProductBundle } from "@/lib/bundle/product-validator";
import { issueBoundMcpRunToken } from "../helpers/mcp-run";

const principal = { actorId: "author", userId: "author", sessionId: "session", authMethod: "session" as const, scopes: ["authoring:stage"] };
function request(): CreateProductDraftRequest {
  const bootstrapToken = issueMcpBootstrapToken({ actorId: principal.actorId, sessionId: principal.sessionId, stage: "product",
    clientCapabilities: { independentSubagents: true, localArtifactFiles: true, pdfRendering: true } });
  return { bootstrapToken, runToken: issueBoundMcpRunToken({ workflow: "idea_product", courseId: "course", chapterId: "chapter" }, bootstrapToken), draftKey: "first-diktat",
    draft: { products: [{ productType: "diktat", title: "Pangkat", ideaIds: ["idea"], sourceRefs: [{ sourceId: "source", excerptIds: ["excerpt"] }],
      units: [{ ideaIds: ["idea"], parts: [{ kind: "markdown", markdown: "Gunakan aturan pangkat pada hasil kali bilangan yang sama." }] }],
    }] },
  };
}
function harness() {
  let reads = 0;
  const archives: string[] = [];
  const ports: ProductDraftCreationPorts = {
    async loadContext({ run, principal: actor }) {
      reads++;
      return { bundleId: "bundle", courseId: run.courseId, chapterId: run.chapterId, creatorId: actor.actorId, createdAt: new Date(run.issuedAt).toISOString(),
        ideas: [{ id: "idea", version: 1, semanticHash: "a".repeat(64) }], sources: [{ sourceId: "source", version: 1, checksum: "b".repeat(64), excerptIds: ["excerpt"] }], learningSectionIds: [] };
    },
    async stage(input) {
      const bundle = validateProductBundle(Buffer.from(input.bundleBase64, "base64"));
      if (!bundle.success) throw new Error(JSON.stringify(bundle.issues));
      expect(bundle.data.products[0].creatorId).toBe("author");
      archives.push(input.bundleBase64);
      return { ok: true, valid: true, staged: true, publicationReady: false,
        result: { importId: "import", checksum: bundle.data.checksum, status: "draft" } };
    },
  };
  return { ports, archives, reads: () => reads };
}

test("new draft packages content internally and delegates admission without implicit review or publication", async () => {
  const input = request(), h = harness();
  const result = await createProductDraft(input, principal, h.ports);
  expect(result).toMatchObject({ ok: true, staged: true, publicationReady: false, draftKey: "first-diktat", result: { importId: "import", status: "draft" } });
  expect(result).not.toHaveProperty("bundleBase64");
  expect(result).not.toHaveProperty("bundle");
  await createProductDraft(input, principal, h.ports);
  expect(h.archives[1]).toBe(h.archives[0]);
});

test("missing consent, foreign bootstrap and oversized draft fail before context or stage I/O", async () => {
  const input = request(), h = harness();
  await expect(createProductDraft(input, { ...principal, scopes: ["authoring:read"] }, h.ports)).rejects.toThrow("AUTHORING_MCP_SCOPE_REQUIRED");
  await expect(createProductDraft(input, { ...principal, actorId: "other" }, h.ports)).rejects.toThrow("MISMATCH");
  const oversized = structuredClone(input);
  oversized.draft.products[0].title = "x".repeat(524289);
  await expect(createProductDraft(oversized, principal, h.ports)).rejects.toThrow("PRODUCT_DRAFT_REQUEST_TOO_LARGE");
  expect(h.reads()).toBe(0);
  expect(h.archives).toHaveLength(0);
});

test("invalid reference findings are returned together without staging or returning archive bytes", async () => {
  const input = request(), h = harness();
  input.draft.products[0].ideaIds = ["unknown-idea"];
  input.draft.products[0].sourceRefs[0].excerptIds = ["unknown-excerpt"];
  const result = await createProductDraft(input, principal, h.ports);
  expect(result).toMatchObject({ ok: false, staged: false, publicationReady: false, category: "content", issueCount: 2 });
  expect(result.diagnostics).toHaveLength(2);
  expect(h.archives).toHaveLength(0);
});

test("the lightweight catalog envelope never bypasses strict server-side content validation", async () => {
  const input = request(), h = harness();
  const invalid = { ...input, draft: { products: [{ ...input.draft.products[0], creatorId: "other", status: "published" }] } };
  await expect(createProductDraft(invalid, principal, h.ports)).rejects.toThrow("PRODUCT_DRAFT_INPUT_INVALID");
  expect(h.reads()).toBe(0);
  expect(h.archives).toHaveLength(0);
});

test("canonical staging rejection remains a rejection with actionable diagnostics", async () => {
  const h = harness();
  h.ports.stage = async () => ({ ok: false, staged: false, publicationReady: false,
    issues: [{ code: "PRODUCT_POLICY_BLOCKED", path: "products.0", message: "Review the stated condition." }] });
  const result = await createProductDraft(request(), principal, h.ports);
  expect(result).toMatchObject({ ok: false, staged: false, publicationReady: false, category: "content" });
  expect(result.diagnostics).toHaveLength(1);
  expect(result).not.toHaveProperty("authoredProducts");
});
