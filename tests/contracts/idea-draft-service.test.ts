import { expect, test } from "bun:test";
import { z } from "zod";
import { createIdeaDraft, createIdeaDraftToolSchema, type CreateIdeaDraftRequest, type IdeaDraftCreationPorts } from "@/lib/authoring/idea-draft-service";
import { issueMcpBootstrapToken } from "@/lib/authoring/mcp-workflows";
import { validateIdeaBundleZip } from "@/lib/bundle/idea-bundle-v2";
import { issueBoundMcpRunToken } from "../helpers/mcp-run";
import { ideaDraftFixture } from "../helpers/idea-draft";

const principal = { actorId: "author", userId: "author", sessionId: "session", authMethod: "session" as const, scopes: ["authoring:stage"] };
function harness() {
  const { input, context, sourcePack } = ideaDraftFixture();
  const bootstrapToken = issueMcpBootstrapToken({ actorId: principal.actorId, sessionId: principal.sessionId, stage: "idea", clientCapabilities: { independentSubagents: true, localArtifactFiles: true, pdfRendering: true } });
  const runToken = issueBoundMcpRunToken({ workflow: "idea_product", courseId: "course", chapterId: "chapter", sourcePackId: sourcePack.manifest.packId,
    sourcePackImportId: "source-import", sourcePackChecksum: sourcePack.archive.checksum }, bootstrapToken);
  const request: CreateIdeaDraftRequest = { bootstrapToken, runToken, draftKey: "first", draft: input };
  let reads = 0;
  const archives: string[] = [];
  const ports: IdeaDraftCreationPorts = {
    async loadContext({ run, principal: actor }) { reads++; return { ...context, courseId: run.courseId, chapterId: run.chapterId!, creatorId: actor.actorId, createdAt: new Date(run.issuedAt).toISOString() }; },
    async stage(input) {
      const result = validateIdeaBundleZip(Buffer.from(input.bundleBase64, "base64"));
      if (!result.success) throw new Error(JSON.stringify(result.issues));
      archives.push(input.bundleBase64);
      return { ok: true, staged: true, result: { importId: "import", checksum: result.data.canonicalChecksum, status: "draft" } };
    },
  };
  return { request, ports, reads: () => reads, archives };
}

test("direct creation stages internally, returns stable IDs and leaves review/publication required", async () => {
  const h = harness();
  const result = await createIdeaDraft(h.request, principal, h.ports);
  expect(result).toMatchObject({ ok: true, staged: true, publicationReady: false, draftKey: "first", result: { importId: "import", status: "draft" } });
  expect(result).not.toHaveProperty("bundleBase64");
  expect(result).not.toHaveProperty("bundle");
  expect(result.authoredIdeas).toHaveLength(1);
  await createIdeaDraft(h.request, principal, h.ports);
  expect(h.archives[1]).toBe(h.archives[0]);
});

test("scope, actor, session and request checks run before source or staging I/O", async () => {
  const h = harness();
  await expect(createIdeaDraft(h.request, { ...principal, scopes: ["authoring:read"] }, h.ports)).rejects.toThrow("AUTHORING_MCP_SCOPE_REQUIRED");
  await expect(createIdeaDraft(h.request, { ...principal, actorId: "foreign" }, h.ports)).rejects.toThrow("MISMATCH");
  await expect(createIdeaDraft(h.request, { ...principal, sessionId: "foreign" }, h.ports)).rejects.toThrow("MISMATCH");
  await expect(createIdeaDraft({ ...h.request, draft: { excess: "x".repeat(524289) } }, principal, h.ports)).rejects.toThrow("IDEA_DRAFT_REQUEST_TOO_LARGE");
  await expect(createIdeaDraft({ ...h.request, draft: { ...h.request.draft, creatorId: "foreign" } }, principal, h.ports)).rejects.toThrow("IDEA_DRAFT_INPUT_INVALID");
  expect(h.reads()).toBe(0);
  expect(h.archives).toHaveLength(0);
});

test("unbound source, wrong workflow and expired run never load context", async () => {
  const h = harness();
  const run = { courseId: "course", chapterId: "chapter" };
  await expect(createIdeaDraft({ ...h.request, runToken: issueBoundMcpRunToken(run, h.request.bootstrapToken) }, principal, h.ports)).rejects.toThrow("AUTHORING_MCP_SOURCE_PACK_REQUIRED");
  await expect(createIdeaDraft({ ...h.request, runToken: issueBoundMcpRunToken({ ...run, workflow: "quiz_bank" }, h.request.bootstrapToken) }, principal, h.ports)).rejects.toThrow("AUTHORING_MCP_WORKFLOW_MISMATCH");
  await expect(createIdeaDraft({ ...h.request, runToken: issueBoundMcpRunToken({ ...run, ttlMs: -1000 }, h.request.bootstrapToken) }, principal, h.ports)).rejects.toThrow("EXPIRED");
  expect(h.reads()).toBe(0);
});

test("aggregate source reference limit is checked before loading the Source Pack", async () => {
  const h = harness();
  const idea = h.request.draft.ideas[0];
  h.request.draft.ideas = Array.from({ length: 33 }, (_, index) => ({ ...idea, key: `key-${index}`, code: `CODE-${index}`,
    sourceRefs: Array.from({ length: 63 }, () => ({ documentId: "d", unit: 1, quote: "x" })) }));
  await expect(createIdeaDraft(h.request, principal, h.ports)).rejects.toThrow("IDEA_DRAFT_REFERENCE_LIMIT");
  expect(h.reads()).toBe(0);
});

test("content and final staging rejection keep failure diagnostics and never claim authored success", async () => {
  const h = harness();
  h.request.draft.ideas[0].sourceRefs[0].quote = "A quote absent from the source.";
  const invalid = await createIdeaDraft(h.request, principal, h.ports);
  expect(invalid).toMatchObject({ ok: false, valid: false, staged: false, publicationReady: false, category: "content", issueCount: 1 });
  expect(h.archives).toHaveLength(0);
  const other = harness();
  other.ports.stage = async () => ({ ok: false, staged: false, issues: [{ code: "IDEA_BUNDLE_SOURCE_VERSION_CONFLICT", message: "Refresh the bound source version." }] });
  const refused = await createIdeaDraft(other.request, principal, other.ports);
  expect(refused).toMatchObject({ ok: false, staged: false, publicationReady: false });
  expect(refused).not.toHaveProperty("authoredIdeas");
  expect(refused.diagnostics).toHaveLength(1);
});

test("tool-list schema stays compact while full parsing rejects invented metadata", async () => {
  expect(Buffer.byteLength(JSON.stringify(z.toJSONSchema(createIdeaDraftToolSchema)), "utf8")).toBeLessThan(4096);
  const h = harness();
  const injected = { ...h.request, draft: { ...h.request.draft, ideas: [{ ...h.request.draft.ideas[0], status: "published" }] } };
  expect(createIdeaDraftToolSchema.safeParse(injected).success).toBe(true);
  await expect(createIdeaDraft(injected, principal, h.ports)).rejects.toThrow("IDEA_DRAFT_INPUT_INVALID");
  expect(h.reads()).toBe(0);
});
