import { expect, test } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { registerRevisionTools, REVISION_MCP_LIMITS, type RevisionServiceMethod } from "@/lib/authoring/revision-mcp";
import { flexibleRevisionContract, issueMcpBootstrapToken, readMcpRunToken } from "@/lib/authoring/mcp-workflows";
import { RECOMMENDED_PLUGIN_VERSION } from "@/lib/authoring/mcp-playbook";

process.env.BETTER_AUTH_SECRET ||= "revision-contract-test-secret-no-external-service";
const hash = "a".repeat(64), nextHash = "b".repeat(64);
const runId = "mcp-run-00000000-0000-4000-8000-000000000000";
const principal = { actorId: "admin", userId: "admin", sessionId: "session", authMethod: "session" as const, scopes: ["authoring:read", "authoring:stage", "authoring:review", "authoring:publish"] };
function bootstrap(stage: "idea" | "product", actorId = "admin", sessionId = "session") {
  return issueMcpBootstrapToken({ actorId, sessionId, stage, bootstrapProtocol: 1, pluginVersion: RECOMMENDED_PLUGIN_VERSION,
    clientCapabilities: { independentSubagents: true, localArtifactFiles: true, pdfRendering: true } });
}
function harness(options: { scopes?: string[]; inactive?: boolean; stale?: boolean; wrongKind?: boolean; rejected?: boolean } = {}) {
  const tools = new Map<string, { config: { annotations: { readOnlyHint: boolean } }; execute: (input: Record<string, unknown>) => Promise<CallToolResult> }>();
  const calls: Array<{ method: RevisionServiceMethod; input: Record<string, unknown> }> = [];
  const context = (input: Record<string, unknown>) => ({ kind: options.wrongKind ? "idea" : input.kind ?? "product", importId: input.importId ?? "draft", revision: options.stale ? nextHash : input.expectedRevision ?? nextHash, status: "draft", scope: { courseId: "course", artifactCourseId: "artifact-course", chapterId: "chapter" }, stagingRunId: runId });
  const server = { registerTool(name: string, config: { annotations: { readOnlyHint: boolean } }, execute: (input: Record<string, unknown>) => Promise<CallToolResult>) { tools.set(name, { config, execute }); } };
  registerRevisionTools(server as unknown as McpServer, { ...principal, scopes: options.scopes ?? principal.scopes }, {
    async assertActor(actorId) { expect(actorId).toBe("admin"); if (options.inactive) throw new Error("AUTHORING_MCP_ADMIN_REQUIRED"); },
    async invoke(method, input) {
      calls.push({ method, input });
      if (method === "getRevisionContext") return context(input);
      if (options.rejected) return { ok: false, detail: "Must never become successful" };
      if (["createRevisionDraft", "patchRevisionDraft", "restoreRevisionDraft"].includes(method)) return context({ ...input, importId: "draft", expectedRevision: nextHash });
      return { method, publicationReady: false };
    },
  });
  return { tools, calls, async call(name: string, input: Record<string, unknown>) { const tool = tools.get(`authoring.${name}`); if (!tool) throw new Error("TOOL_MISSING"); return tool.execute(input); } };
}
const operation = { op: "set", target: { entityType: "article", entityId: "article", sectionId: "section", blockId: "block" }, field: "workedExamplePayload.steps[step-2].reasonMarkdown", value: "Check the result." };
const input = () => ({ kind: "product", importId: "product", expectedRevision: hash, bootstrapToken: bootstrap("product") });

function data(result: CallToolResult) { return result.structuredContent as Record<string, unknown>; }

test("revision MCP exposes all bounded V3+ tools and explicit headless discovery", () => {
  const h = harness();
  expect(h.tools.size).toBe(9);
  expect(h.tools.get("authoring.plan_release")?.config.annotations.readOnlyHint).toBe(true);
  expect(h.tools.get("authoring.publish_release")?.config.annotations.readOnlyHint).toBe(false);
  const contract = flexibleRevisionContract();
  expect(contract.minimumBundleVersion).toBe(3);
  expect(contract.sourcePackRequired).toBe(false);
  expect(contract.runTokenRequired).toBe(false);
  expect(contract.websiteRequired).toBe(false);
  expect(contract.limits).toEqual(REVISION_MCP_LIMITS);
  for (const name of Object.values(contract.tools)) expect(h.tools.has(name)).toBe(true);
});

test("edits need active canonical admin and correct scopes before reading or changing an artifact", async () => {
  const readOnly = harness({ scopes: ["authoring:read"] });
  const denied = await readOnly.call("patch_revision", { ...input(), operations: [operation] });
  expect(data(denied)).toMatchObject({ ok: false, error: "AUTHORING_MCP_SCOPE_REQUIRED", requiredScope: "authoring:stage" });
  expect(denied._meta).toHaveProperty("mcp/www_authenticate");
  expect(readOnly.calls).toHaveLength(0);
  expect(data(await readOnly.call("prepare_revision_verification", { entries: [{ kind: "product", importId: "product", expectedRevision: hash }], bootstrapTokens: { product: bootstrap("product") } })).requiredScope).toBe("authoring:stage");
  expect(readOnly.calls).toHaveLength(0);
  const inactive = harness({ inactive: true });
  expect(data(await inactive.call("get_edit_context", input())).error).toBe("AUTHORING_MCP_ADMIN_REQUIRED");
  expect(inactive.calls).toHaveLength(0);
  const noPublish = harness({ scopes: ["authoring:read", "authoring:stage", "authoring:review"] });
  expect(data(await noPublish.call("publish_release", { entries: [{ kind: "product", importId: "product", expectedRevision: hash }], bootstrapTokens: { product: bootstrap("product") }, expectedPlanHash: hash })).requiredScope).toBe("authoring:publish");
  expect(noPublish.calls).toHaveLength(0);
});

test("bootstrap identity and current exact artifact prevent expired-run and kind scope shortcuts", async () => {
  for (const token of [bootstrap("product", "other"), bootstrap("product", "admin", "other-session"), bootstrap("idea")]) {
    const h = harness();
    const denied = await h.call("patch_revision", { ...input(), bootstrapToken: token, operations: [operation] });
    expect(denied.isError).toBe(true);
    expect(h.calls).toHaveLength(0);
  }
  const missing = harness();
  const { bootstrapToken: _token, ...withoutBootstrap } = input();
  expect(data(await missing.call("get_edit_context", withoutBootstrap)).error).toBe("REVISION_INPUT_INVALID");
  const stale = harness({ stale: true });
  expect(data(await stale.call("patch_revision", { ...input(), operations: [operation] })).error).toBe("REVISION_STALE_CONTEXT");
  expect(stale.calls.every(call => call.method === "getRevisionContext")).toBe(true);
  const wrong = harness({ wrongKind: true });
  expect(data(await wrong.call("patch_revision", { ...input(), operations: [operation] })).error).toBe("REVISION_KIND_MISMATCH");
});

test("stable nested object patches derive actor and issue current-session verification run without a Source Pack", async () => {
  const h = harness();
  const response = await h.call("patch_revision", { ...input(), operations: [operation] });
  expect(response.isError).not.toBe(true);
  const patch = h.calls.find(call => call.method === "patchRevisionDraft")!;
  expect(patch.input).toMatchObject({ actorId: "admin", kind: "product", importId: "product", expectedRevision: hash, operations: [operation] });
  expect(patch.input).not.toHaveProperty("bootstrapToken");
  expect(h.calls[0].input).not.toHaveProperty("operations");
  expect(h.calls[0].input).not.toHaveProperty("bootstrapToken");
  expect(data(response)).toMatchObject({ importId: "draft", revision: nextHash });
  const execution = data(response).execution as { runToken: string; runId: string };
  const run = readMcpRunToken(execution.runToken);
  expect(run.runId).toBe(runId);
  expect(run.courseId).toBe("artifact-course");
  expect(run.chapterId).toBe("chapter");
  expect(run.sourcePackId).toBeNull();
  expect(run.bootstrap).toMatchObject({ actorId: "admin", sessionId: "session" });
  const renewed = data(await h.call("get_edit_context", input())).execution as { runToken: string };
  expect(readMcpRunToken(renewed.runToken).runId).toBe(runId);
});

test("numeric and prototype paths, forged reviewer identities and oversized requests fail before service mutations", async () => {
  for (const field of ["sections.0.title", "steps[0].reasonMarkdown", "constructor.name", "payload.prototype.name", "payload.__proto__.name", "steps[constructor].reasonMarkdown"]) {
    const h = harness();
    expect(data(await h.call("patch_revision", { ...input(), operations: [{ ...operation, field }] })).error).toBe("REVISION_INPUT_INVALID");
    expect(h.calls).toHaveLength(0);
  }
  const h = harness();
  expect(data(await h.call("review_revision", { ...input(), evidence: { decision: "approved", reviewerId: "other" } })).error).toBe("REVISION_INPUT_INVALID");
  expect(data(await h.call("patch_revision", { ...input(), actorId: "other", operations: [operation] })).error).toBe("REVISION_INPUT_INVALID");
  expect(data(await h.call("patch_revision", { ...input(), operations: [{ ...operation, value: "x".repeat(REVISION_MCP_LIMITS.requestBytes) }] })).error).toBe("REVISION_REQUEST_TOO_LARGE");
  expect(data(await h.call("patch_revision", { ...input(), operations: Array.from({ length: REVISION_MCP_LIMITS.operations + 1 }, () => operation) })).error).toBe("REVISION_INPUT_INVALID");
  expect(h.calls).toHaveLength(0);
});

test("mixed release verifies both kind bootstraps and forwards only exact manifest entries and plan hash", async () => {
  const entries = [{ kind: "idea", importId: "idea", expectedRevision: hash }, { kind: "product", importId: "product", expectedRevision: nextHash }];
  const h = harness();
  const tokens = { idea: bootstrap("idea"), product: bootstrap("product") };
  expect((await h.call("plan_release", { entries, bootstrapTokens: tokens })).isError).not.toBe(true);
  expect(h.calls.some(call => call.method === "prepareRevisionVerification")).toBe(false);
  expect((await h.call("prepare_revision_verification", { entries, bootstrapTokens: tokens })).isError).not.toBe(true);
  const prepared = h.calls.find(call => call.method === "prepareRevisionVerification")!;
  expect(prepared.input).toEqual({ actorId: "admin", entries: entries.map(({ importId, expectedRevision }) => ({ importId, expectedRevision })) });
  expect((await h.call("publish_release", { entries, bootstrapTokens: tokens, expectedPlanHash: hash })).isError).not.toBe(true);
  const published = h.calls.find(call => call.method === "publishRevisionRelease")!;
  expect(published.input).toEqual({ actorId: "admin", entries: entries.map(({ importId, expectedRevision }) => ({ importId, expectedRevision })), expectedPlanHash: hash });
  expect(published.input).not.toHaveProperty("bootstrapTokens");
  const missing = harness();
  expect(data(await missing.call("publish_release", { entries, bootstrapTokens: { product: tokens.product }, expectedPlanHash: hash })).error).toBe("AUTHORING_MCP_BOOTSTRAP_REQUIRED");
  expect(missing.calls).toHaveLength(0);
  expect(data(await missing.call("plan_release", { entries: [entries[0], entries[0]], bootstrapTokens: tokens })).error).toBe("REVISION_INPUT_INVALID");
});

test("create, review, history and restore retain distinct draft and historical identities", async () => {
  const h = harness();
  const token = bootstrap("idea");
  expect((await h.call("create_revision", { kind: "idea", bootstrapToken: token, baseImportId: "idea", expectedRevision: hash, entityIds: ["idea-1"] })).isError).not.toBe(true);
  expect((await h.call("review_revision", { kind: "idea", bootstrapToken: token, importId: "idea", expectedRevision: hash, evidence: { decision: "approved", items: [{ id: "idea-1", decision: "approved" }] } })).isError).not.toBe(true);
  expect((await h.call("list_revisions", { kind: "idea", bootstrapToken: token, importId: "idea", expectedRevision: hash })).isError).not.toBe(true);
  expect((await h.call("restore_revision", { kind: "idea", bootstrapToken: token, historicalImportId: "idea", expectedRevision: hash, currentImportId: "idea", currentRevision: nextHash })).isError).not.toBe(true);
  const restored = h.calls.find(call => call.method === "restoreRevisionDraft")!;
  expect(restored.input).toEqual({ actorId: "admin", kind: "idea", historicalImportId: "idea", expectedRevision: hash, currentImportId: "idea", currentRevision: nextHash });
  expect(h.calls.some(call => call.method === "publishRevisionRelease")).toBe(false);
});

test("service rejection cannot be relabeled as a successful revision response", async () => {
  const h = harness({ rejected: true });
  const response = await h.call("review_revision", { ...input(), evidence: { decision: "approved" } });
  expect(response.isError).toBe(true);
  expect(data(response).ok).toBe(false);
});
