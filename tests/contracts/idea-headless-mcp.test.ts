import { issueBoundMcpRunToken } from "../helpers/mcp-run";
import { afterAll, expect, mock, test } from "bun:test";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

process.env.BETTER_AUTH_SECRET = "test-better-auth-secret-for-headless-idea-contract";
const revision = "a".repeat(64);
const originalStaging = { ...await import("@/lib/bundle/staging") };
const originalPublication = { ...await import("@/lib/bundle/publication") };
const originalDb = { ...await import("@/lib/db") };
const originalCourseIdentity = { ...await import("@/lib/admin/course-identity") };
const calls: { name: string; input: any }[] = [];
let row: any = { id: "import", bundleId: "bundle", checksum: revision, courseId: "legacy-course", status: "validated" };
let chapter = "chapter";
mock.module("@/lib/admin/course-identity", () => ({ ...originalCourseIdentity, resolveCourseIdentity: async (id: string) => id === "course" ? { canonicalId: "course", legacyId: "legacy-course", allIds: ["course", "legacy-course"] } : null }));
mock.module("@/lib/db", () => ({ db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: "course", legacyCourseId: "legacy-course" }] }) }) }) } }));
mock.module("@/lib/bundle/staging", () => ({
  ...originalStaging,
  getIdeaBundleImport: async () => row,
  parseStagedIdeaBundle: async () => ({ manifest: { bundleChecksum: revision, courseId: "course" }, entities: { ideas: [{ chapterId: chapter }], learningSections: [{ chapterId: chapter }], sourceMaterials: [{ chapterId: chapter }] } }),
}));
mock.module("@/lib/bundle/publication", () => ({
  ...originalPublication,
  getIdeaRevisionReviewContext: async (input: any) => { calls.push({ name: "context", input }); return { revision, ideas: [{ id: "idea", ideaHash: "b".repeat(64) }] }; },
  reviewIdeaBundleRevision: async (input: any) => { calls.push({ name: "review", input }); return { status: "approved", revision }; },
  publishIdeaBundle: async (input: any) => { calls.push({ name: "publish", input }); return { publicationId: "pub", published: calls.filter((call) => call.name === "publish").length === 1 }; },
  withdrawIdeaBundle: async (input: any) => { calls.push({ name: "withdraw", input }); return { withdrawn: calls.filter(call => call.name === "withdraw").length === 1 }; },
}));
const { createAuthoringMcpServer } = await import("@/lib/authoring/mcp-server");
const { issueMcpBootstrapToken, issueMcpRunToken } = await import("@/lib/authoring/mcp-workflows");
const { requestedScopes, approvedScopes } = await import("@/lib/authoring/mcp-oauth");

const principal = { userId: "admin", actorId: "admin", sessionId: "session", scopes: ["authoring:read", "authoring:review", "authoring:publish"], authMethod: "oauth" as const };
const clientCapabilities = { independentSubagents: true, localArtifactFiles: true, pdfRendering: false };
const bootstrapToken = issueMcpBootstrapToken({ actorId: "admin", sessionId: "session", stage: "idea", bootstrapProtocol: 1, clientCapabilities });
const boundRun = (scope: Parameters<typeof issueMcpRunToken>[0]) => issueBoundMcpRunToken(scope, bootstrapToken);
const runToken = boundRun({ workflow: "idea_product", courseId: "course", chapterId: "chapter" });
const args = { runToken, bootstrapToken, importId: "import", expectedRevision: revision };

afterAll(() => {
  mock.module("@/lib/db", () => originalDb);
  mock.module("@/lib/bundle/staging", () => originalStaging);
  mock.module("@/lib/bundle/publication", () => originalPublication);
  mock.module("@/lib/admin/course-identity", () => originalCourseIdentity);
});

async function invoke(name: string, input: Record<string, unknown>, scopes = principal.scopes) {
  const server = createAuthoringMcpServer({ ...principal, scopes });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  const response = await transport.handleRequest(new Request("http://localhost/api/mcp/authoring", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: input } }) }));
  return (await response.json() as any).result;
}

test("headless Idea context, explicit item review and publication use the authenticated actor and exact revision", async () => {
  calls.length = 0;
  const context = await invoke("authoring.get_idea_review_context", args);
  expect(context.structuredContent.result.revision).toBe(revision);
  const items = [{ ideaId: "idea", ideaHash: "b".repeat(64), status: "approved" }];
  expect((await invoke("authoring.review_idea_revision", { ...args, decision: "approved", items })).structuredContent.ok).toBe(true);
  expect((await invoke("authoring.publish_idea_bundle", args)).structuredContent.result.published).toBe(true);
  expect((await invoke("authoring.publish_idea_bundle", args)).structuredContent.result.published).toBe(false);
  expect(calls.map((call) => call.name)).toEqual(["context", "review", "publish", "publish"]);
  expect(calls[1].input).toMatchObject({ reviewerId: "admin", expectedRevision: revision, items });
  expect(calls[2].input).toEqual({ importId: "import", publishedBy: "admin", expectedRevision: revision });
});

test("headless Idea withdrawal requires its own scope and exact run revision", async () => {
  calls.length = 0;
  const denied = await invoke("authoring.withdraw_idea_bundle", args);
  expect(denied.structuredContent.requiredScope).toBe("authoring:withdraw");
  expect(calls).toHaveLength(0);
  const scopes = [...principal.scopes, "authoring:withdraw"];
  expect((await invoke("authoring.withdraw_idea_bundle", { ...args, expectedRevision: "c".repeat(64) }, scopes)).structuredContent.error).toBe("IDEA_BUNDLE_STALE_CONTEXT");
  expect(calls).toHaveLength(0);
  expect((await invoke("authoring.withdraw_idea_bundle", args, scopes)).structuredContent.result.withdrawn).toBe(true);
  expect((await invoke("authoring.withdraw_idea_bundle", args, scopes)).structuredContent.result.withdrawn).toBe(false);
  expect(calls[0].input).toEqual({ importId: "import", withdrawnBy: "admin", expectedRevision: revision, expectedCourseId: "legacy-course" });
});

test("Idea withdrawal recovers an exact old import without a run or Source Pack", async () => {
  calls.length = 0;
  const prior = row;
  row = { ...row, status: "published" };
  const scopes = [...principal.scopes, "authoring:withdraw"];
  const { runToken: _runToken, ...withoutRun } = args;
  try {
    expect((await invoke("authoring.withdraw_idea_bundle", withoutRun, scopes)).structuredContent.error).toBe("AUTHORING_MCP_RUN_REQUIRED");
    expect((await invoke("authoring.withdraw_idea_bundle", { ...withoutRun, recovery: "exact_import" }, scopes)).structuredContent.result.withdrawn).toBe(true);
    expect(calls[0].input).toEqual({ importId: "import", withdrawnBy: "admin", expectedRevision: revision, expectedCourseId: "legacy-course" });
    row = { ...row, courseId: "other-course" };
    expect((await invoke("authoring.withdraw_idea_bundle", { ...withoutRun, recovery: "exact_import" }, scopes)).structuredContent.error).toBe("AUTHORING_MCP_IMPORT_COURSE_SCOPE_MISMATCH");
    expect(calls).toHaveLength(1);
  } finally { row = prior; }
});

test("scope, run, bootstrap, revision and chapter gates fail before publication", async () => {
  calls.length = 0;
  const denied = await invoke("authoring.publish_idea_bundle", args, ["authoring:read", "authoring:review"]);
  expect(denied.isError).toBe(true);
  expect(denied.structuredContent).toMatchObject({ error: "AUTHORING_MCP_SCOPE_REQUIRED", requiredScope: "authoring:publish" });
  expect(denied._meta["mcp/www_authenticate"][0]).toContain('error="insufficient_scope"');
  expect(denied._meta["mcp/www_authenticate"][0]).toContain('scope="authoring:publish"');
  expect(requestedScopes(null)).not.toContain("authoring:publish");
  const expanded = "authoring:read authoring:review authoring:publish";
  expect(approvedScopes(expanded, requestedScopes(expanded))).toContain("authoring:publish");
  expect(() => approvedScopes(null, ["authoring:publish"])).toThrow("invalid_scope");
  expect((await invoke("authoring.publish_idea_bundle", { ...args, bootstrapToken: issueMcpBootstrapToken({ actorId: "other", sessionId: "session", stage: "idea", clientCapabilities }) })).structuredContent.error).toBe("AUTHORING_MCP_BOOTSTRAP_PRINCIPAL_MISMATCH");
  expect((await invoke("authoring.publish_idea_bundle", { ...args, runToken: boundRun({ workflow: "quiz_bank", courseId: "course", chapterId: "chapter" }) })).structuredContent.error).toBe("AUTHORING_MCP_WORKFLOW_MISMATCH");
  expect((await invoke("authoring.publish_idea_bundle", { ...args, expectedRevision: "c".repeat(64) })).structuredContent.error).toBe("IDEA_BUNDLE_STALE_CONTEXT");
  chapter = "other-chapter";
  expect((await invoke("authoring.publish_idea_bundle", args)).structuredContent.error).toBe("AUTHORING_MCP_IMPORT_SCOPE_MISMATCH");
  chapter = "chapter";
  row = { ...row, courseId: "different-course" };
  expect((await invoke("authoring.publish_idea_bundle", args)).structuredContent.error).toBe("AUTHORING_MCP_IMPORT_COURSE_SCOPE_MISMATCH");
  expect(calls).toHaveLength(0);
});


test("Idea restage rejects the target's old chapter before reading replacement bytes or changing reviews", async () => {
  calls.length = 0;
  const reviews = [{ reviewerId: "admin", status: "approved" }];
  row = { id: "import", bundleId: "bundle", checksum: revision, courseId: "legacy-course", status: "approved", reviews };
  chapter = "chapter-a";
  const input = { ...args, runToken: boundRun({ workflow: "idea_product", courseId: "course", chapterId: "chapter-b" }), filename: "replacement.zip", bundleBase64: Buffer.from("not read before target authorization").toString("base64") };
  const result = await invoke("authoring.restage_idea_bundle", input, [...principal.scopes, "authoring:stage"]);
  expect(result.structuredContent.error).toBe("AUTHORING_MCP_IMPORT_SCOPE_MISMATCH");
  expect(row.reviews).toEqual(reviews);
  expect(row.checksum).toBe(revision);
  expect(calls).toHaveLength(0);
  chapter = "chapter";
});


test("Idea lifecycle requires a run already bound to the principal session", async () => {
  calls.length = 0;
  const legacyRun = issueMcpRunToken({ workflow: "idea_product", courseId: "course", chapterId: "chapter" });
  const common = { ...args, runToken: legacyRun, decision: "approved", items: [{ ideaId: "idea", ideaHash: "b".repeat(64), status: "approved" }], filename: "replacement.zip", bundleBase64: Buffer.from("not read").toString("base64") };
  for (const name of ["authoring.get_idea_review_context", "authoring.review_idea_revision", "authoring.publish_idea_bundle", "authoring.restage_idea_bundle"]) {
    expect((await invoke(name, common, [...principal.scopes, "authoring:stage"])).structuredContent.error).toBe("AUTHORING_MCP_LEGACY_RUN_RESTART_REQUIRED");
  }
  expect(calls).toHaveLength(0);
});
