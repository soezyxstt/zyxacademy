import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { registerOperationDescriptor } from "@/lib/admin-mcp/operation-contracts";
import { requireMcpScope, type McpPrincipal } from "./mcp-auth";
import { insufficientScopeChallenge } from "./mcp-oauth";
import { issueMcpRunToken, verifyMcpExecutionBootstrap } from "./mcp-workflows";
import { projectRevisionResponse, type RevisionContextOptions } from "./revision-response";
import { authoringFailureDiagnostics } from "./diagnostics";

export const REVISION_MCP_LIMITS = { operations: 128, releaseEntries: 16, entityIds: 256, requestBytes: 524_288 } as const;
const identifier = z.string().trim().min(1).max(256).regex(/^[^\u0000-\u001f]+$/);
const revision = z.string().regex(/^[a-f0-9]{64}$/);
const kind = z.enum(["idea", "product"]);
const bootstrap = z.string().min(1).max(32_768);
const identity = { kind, bootstrapToken: bootstrap, importId: identifier, expectedRevision: revision };
const responseMode = z.enum(["full", "compact"]).optional();
export const revisionReadTargetSchema = z.object({ entityType: identifier, entityId: identifier, sectionId: identifier.optional(), blockId: identifier.optional(), unitId: identifier.optional(), itemId: identifier.optional() }).strict().refine(target => !(target.blockId && !target.sectionId) && !(target.itemId && (target.sectionId || target.blockId || target.unitId)) && !(target.unitId && (target.sectionId || target.blockId)), "A block needs its section ID; an item or Diktat unit must be selected without a section or block");
const field = z.string().max(256).refine(value => {
  const segments = value.split(".");
  if (!value || segments.length > 8) return false;
  return segments.every(segment => {
    const match = /^([A-Za-z][A-Za-z0-9_]*)(?:\[([A-Za-z0-9_:-]+)\])?$/.exec(segment);
    if (!match || ["__proto__", "constructor", "prototype"].includes(match[1])) return false;
    return !match[2] || (!/^\d+$/.test(match[2]) && !["__proto__", "constructor", "prototype"].includes(match[2]));
  });
}, "Use stable-ID object fields, never numeric array positions or prototype paths");
export const revisionPatchOperationSchema = z.object({
  op: z.enum(["set", "add", "remove", "move"]),
  target: revisionReadTargetSchema,
  field: field.optional(), value: z.unknown().optional(), beforeId: identifier.nullable().optional(),
}).strict();
const derivedContentReviewSchema = z.object({ entityId: identifier, sourceArticleId: identifier, expectedArticleHash: revision,
  unitIds: z.array(identifier).min(1).max(100).refine(ids => new Set(ids).size === ids.length, "Duplicate Diktat unit"),
  notes: z.string().trim().min(20).max(2000),
}).strict();
const entry = z.object({ kind, importId: identifier, expectedRevision: revision }).strict();
const release = {
  entries: z.array(entry).min(1).max(REVISION_MCP_LIMITS.releaseEntries).refine(entries => new Set(entries.map(item => item.importId)).size === entries.length, "Duplicate release import"),
  bootstrapTokens: z.object({ idea: bootstrap.optional(), product: bootstrap.optional() }).strict(),
};
const evidence = z.record(z.string(), z.unknown()).refine(value => !Object.keys(value).some(key => ["actorId", "reviewerId", "publishedBy", "importId", "expectedRevision", "role", "scope", "__proto__", "constructor", "prototype"].includes(key)), "Identity is derived by the server");

export type RevisionServiceMethod = "getRevisionContext" | "createRevisionDraft" | "patchRevisionDraft" | "planRevisionRelease" | "prepareRevisionVerification" | "reviewRevisionDraft" | "publishRevisionRelease" | "listRevisionHistory" | "restoreRevisionDraft";
type Ports = {
  assertActor(actorId: string): Promise<void>;
  verifyBootstrap: typeof verifyMcpExecutionBootstrap;
  invoke(method: RevisionServiceMethod, input: Record<string, unknown>): Promise<unknown>;
};
const defaults: Ports = {
  async assertActor(actorId) {
    const [{ db }, { assertAuthoringActor }] = await Promise.all([import("@/db"), import("@/lib/auth/authoring-actor")]);
    await assertAuthoringActor(db, actorId, { roles: ["admin"], requireLegacyAdmin: true, error: "AUTHORING_MCP_ADMIN_REQUIRED" });
  },
  verifyBootstrap: verifyMcpExecutionBootstrap,
  async invoke(method, input) {
    const service = await import("./revision-service");
    const execute = service[method] as unknown as (input: Record<string, unknown>) => Promise<unknown>;
    return execute(input);
  },
};
type Registrar = { registerTool(name: string, config: { description: string; inputSchema: Record<string, z.ZodType>; annotations: { readOnlyHint: boolean; destructiveHint: boolean; openWorldHint: boolean } }, callback: (input: Record<string, unknown>) => Promise<CallToolResult>): unknown };
function result(payload: Record<string, unknown>, isError = false): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload, ...(isError ? { isError: true } : {}) };
}
function failure(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : "";
  const rawCode = message.split(":", 1)[0];
  const code = error instanceof z.ZodError ? "REVISION_INPUT_INVALID" : /^(?:AUTHORING_MCP|REVISION|IDEA_BUNDLE|PRODUCT_BUNDLE|PRODUCT_REVIEW|PRODUCT_V[345]|SOLUTION_COLLECTION)_[A-Z0-9_]+$/.test(rawCode) ? rawCode : "REVISION_REQUEST_FAILED";
  const scope = code === "AUTHORING_MCP_SCOPE_REQUIRED" ? message.slice(message.indexOf(":") + 1).trim() : undefined;
  const requiredScope = scope && /^authoring:(read|stage|review|publish|withdraw)$/.test(scope) ? scope : undefined;
  const remediation = requiredScope ? "Reauthorize this client with the required scope and retry with fresh consent."
    : /BOOTSTRAP|TOKEN|SESSION/.test(code) ? "Read workflow.get_playbook for the matching Idea or Product stage and pass its fresh bootstrapToken from this account and session."
    : /STALE|CONFLICT|PLAN_CHANGED/.test(code) ? "Read authoring.get_edit_context again, reconcile the returned revision, and rerun authoring.plan_release before retrying."
    : /LIMIT|TOO_LARGE/.test(code) ? "Split the change into requests within the advertised limits. After every accepted patch, use its returned successor importId and revision. A release supports at most 16 exact entries."
    : /VERSION|PROFILE/.test(code) ? "Use an Idea or learning Product Bundle V3 or newer. Revision editing does not support V1 or V2."
    : "Read authoring.get_edit_context and authoring.plan_release for current requirements and recovery actions. No publication was implicitly authorized.";
  return { ...result({ ok: false, error: code, remediation, ...authoringFailureDiagnostics(error, { code }), ...(requiredScope ? { requiredScope } : {}), ...(error instanceof z.ZodError ? { issues: error.issues.map(issue => ({ code: issue.code, path: issue.path })) } : {}) }, true),
    ...(requiredScope ? { _meta: { "mcp/www_authenticate": [insufficientScopeChallenge(requiredScope)] } } : {}),
  };
}

/** Existing artifacts supply scope; editing never requires a replacement Source Pack or an expired run. */
export function registerRevisionTools(server: McpServer, principal: McpPrincipal, overrides: Partial<Ports> = {}) {
  const ports = { ...defaults, ...overrides };
  const registrar = server as unknown as Registrar;
  const actorId = principal.actorId;
  function verify(inputKind: "idea" | "product", token: string | undefined) {
    if (!token) throw new Error("AUTHORING_MCP_BOOTSTRAP_REQUIRED");
    const checked = ports.verifyBootstrap({ actorId, sessionId: principal.sessionId, bootstrapToken: token, requiredStage: inputKind, expectedWorkflow: "idea_product" });
    if (checked.mode !== "verified") throw new Error("AUTHORING_MCP_BOOTSTRAP_REQUIRED");
    return checked.bootstrap;
  }
  async function readContext(input: { kind: "idea" | "product"; importId: string; expectedRevision: string } & RevisionContextOptions) {
    const context = await ports.invoke("getRevisionContext", { actorId, kind: input.kind, importId: input.importId, expectedRevision: input.expectedRevision, ...(input.responseMode ? { responseMode: input.responseMode } : {}), ...(input.target ? { target: input.target } : {}) });
    if (!context || typeof context !== "object" || !("kind" in context) || context.kind !== input.kind) throw new Error("REVISION_KIND_MISMATCH");
    if (!("revision" in context) || context.revision !== input.expectedRevision) throw new Error("REVISION_STALE_CONTEXT");
    return context;
  }
  function withExecution(context: unknown, inputKind: "idea" | "product", token: string) {
    if (!context || typeof context !== "object" || !("kind" in context) || context.kind !== inputKind) throw new Error("REVISION_KIND_MISMATCH");
    if (!("stagingRunId" in context) || typeof context.stagingRunId !== "string") return context;
    if (!("scope" in context) || !context.scope || typeof context.scope !== "object") throw new Error("REVISION_EXECUTION_IDENTITY_REQUIRED");
    const scope = context.scope as Record<string, unknown>;
    if (typeof scope.courseId !== "string" || typeof scope.chapterId !== "string") throw new Error("REVISION_EXECUTION_IDENTITY_REQUIRED");
    const boundBootstrap = verify(inputKind, token);
    return { ...context, execution: {
      runId: context.stagingRunId,
      runToken: issueMcpRunToken({ runId: context.stagingRunId, workflow: "idea_product", courseId: typeof scope.artifactCourseId === "string" ? scope.artifactCourseId : scope.courseId, chapterId: scope.chapterId, bootstrap: boundBootstrap }),
      sourcePackRequired: false, bootstrapTokenRequired: true,
      continuation: "Use the returned importId/revision for the next edit or review. Use this current-session runToken and the matching fresh bootstrapToken for trusted verification or the private operator. Renew via authoring.get_edit_context; no run adoption is required.",
    } };
  }
  async function draftResult(method: "createRevisionDraft" | "patchRevisionDraft" | "restoreRevisionDraft", input: Record<string, unknown>, inputKind: "idea" | "product", token: string) {
    const options: RevisionContextOptions = input.responseMode === "compact" ? { responseMode: "compact" } : {};
    const value = await ports.invoke(method, input);
    if (!value || typeof value !== "object") throw new Error("REVISION_CONTEXT_INVALID");
    if ("stagingRunId" in value && typeof value.stagingRunId === "string") return projectRevisionResponse(withExecution(value, inputKind, token), options);
    if ("importId" in value && typeof value.importId === "string" && "revision" in value && typeof value.revision === "string") {
      const context = await readContext({ kind: inputKind, importId: value.importId, expectedRevision: value.revision, ...options });
      if (!("stagingRunId" in context) || typeof context.stagingRunId !== "string") throw new Error("REVISION_EXECUTION_IDENTITY_REQUIRED");
      return projectRevisionResponse(withExecution({ ...value, ...context }, inputKind, token), options);
    }
    throw new Error("REVISION_CONTEXT_INVALID");
  }
  function register<T extends z.ZodObject>(name: string, schema: T, scope: "read" | "stage" | "review" | "publish", description: string, execute: (input: z.infer<T>) => Promise<unknown>) {
    const descriptor = registerOperationDescriptor(server, { name, scope: scope === "read" ? ["authoring:read"] : ["authoring:read", `authoring:${scope}`], schema, description, write: scope !== "read", protocol: "authoring-revision",
      ...(name === "authoring.patch_revision" ? { conditionalScopes: ["authoring:review"] } : {}),
    });
    registrar.registerTool(name, { description, inputSchema: schema.shape, annotations: descriptor.annotations }, async raw => {
      try {
        requireMcpScope(principal, "authoring:read");
        if (scope !== "read") requireMcpScope(principal, `authoring:${scope}`);
        const input = schema.strict().parse(raw) as z.infer<T>;
        if (Buffer.byteLength(JSON.stringify(input), "utf8") > REVISION_MCP_LIMITS.requestBytes) throw new Error("REVISION_REQUEST_TOO_LARGE");
        await ports.assertActor(actorId);
        const value = await execute(input);
        if (value && typeof value === "object" && "ok" in value && value.ok === false) throw new Error("REVISION_SERVICE_REJECTED");
        return result(value && typeof value === "object" && !Array.isArray(value) ? { ...value, ok: true } : { ok: true, result: value });
      } catch (error) { return failure(error); }
    });
  }
  register("authoring.get_edit_context", z.object({ ...identity, responseMode, target: revisionReadTargetSchema.optional() }), "read", "Read an exact V3+ Idea/Product revision. Default full includes review context. Use responseMode compact for identity and impact, or target for one stable entity, section, block, Diktat unit or collection item; compact and targeted reads defer review/readiness. No Source Pack or authoring run is required.", async input => {
    verify(input.kind, input.bootstrapToken);
    return projectRevisionResponse(withExecution(await readContext(input), input.kind, input.bootstrapToken), input);
  });
  register("authoring.create_revision", z.object({ kind, bootstrapToken: bootstrap, baseImportId: identifier, expectedRevision: revision, entityIds: z.array(identifier).min(1).max(REVISION_MCP_LIMITS.entityIds).optional(), responseMode }), "stage", "Create a durable editable revision from the observed live artifact or editable V3+ draft. Use restore_revision for withdrawn historical content. For a single-product edit, pass entityIds containing its stable product ID. Direct patches outside this selection are rejected. Optional responseMode compact returns identity/impact without a full bundle or readiness computation; read full context before review.", async ({ bootstrapToken, ...input }) => {
    verify(input.kind, bootstrapToken);
    // The service validates actor, kind, scope and exact revision before writing,
    // then repeats its snapshot check under lock. A transport pre-read would
    // download the same archive twice without strengthening those guards.
    return draftResult("createRevisionDraft", { actorId, ...input }, input.kind, bootstrapToken);
  });
  register("authoring.patch_revision", z.object({ ...identity, operations: z.array(revisionPatchOperationSchema).max(REVISION_MCP_LIMITS.operations), derivedContentReviews: z.array(derivedContentReviewSchema).min(1).max(100).optional(), refreshPrintEvidence: z.boolean().optional(), responseMode })
    .refine(input => input.operations.length > 0 || !!input.derivedContentReviews?.length || input.refreshPrintEvidence === true, "Provide a content patch, an explicit derived-content review, or print evidence refresh")
    .refine(input => !input.refreshPrintEvidence || !input.operations.length && !input.derivedContentReviews?.length, "Print evidence refresh must not include content patches or derived reviews"), "stage", "Patch a draft by stable entity, section, block, Diktat unit or item IDs. Supports set/add/remove/move. Exact revision protects other edits; the server rebuilds hashes and returns a successor importId/revision plus impact. Use the returned identity on every next call. responseMode compact omits the full bundle and defers review/readiness. derivedContentReviews needs authoring:review and confirms unchanged Diktat units against the exact current source Article hash. For V4 print-proof recovery, use operations:[] with refreshPrintEvidence:true alone; the server retains proven versions or creates new evidence versions without editing prose. Release review and verification still apply.", async ({ bootstrapToken, ...input }) => {
    verify(input.kind, bootstrapToken);
    if (input.derivedContentReviews?.length) {
      requireMcpScope(principal, "authoring:review");
      if (input.kind !== "product") throw new Error("REVISION_DERIVED_REVIEW_TARGET_INVALID");
    }
    if (input.refreshPrintEvidence && input.kind !== "product") throw new Error("REVISION_PRINT_REFRESH_V4_REQUIRED");
    return draftResult("patchRevisionDraft", { actorId, ...input }, input.kind, bootstrapToken);
  });
  register("authoring.plan_release", z.object(release), "read", "Plan an atomic release manifest across Idea and Product V3+ draft revisions, including mixed V3/V4/V5 references. Returns exact blockers, affected evidence and a planHash; never publishes.", async ({ entries, bootstrapTokens }) => {
    for (const item of entries) { verify(item.kind, bootstrapTokens[item.kind]); await readContext(item); }
    return ports.invoke("planRevisionRelease", { actorId, entries: entries.map(({ importId, expectedRevision }) => ({ importId, expectedRevision })) });
  });
  register("authoring.prepare_revision_verification", z.object(release), "stage", "Explicitly prepare server-attested prospective Idea references for trusted V4 verification within an exact mixed release. This stage write binds candidate snapshots and reports invalidated evidence; it never reviews or publishes. Planning itself remains read-only.", async ({ entries, bootstrapTokens }) => {
    for (const item of entries) { verify(item.kind, bootstrapTokens[item.kind]); await readContext(item); }
    return ports.invoke("prepareRevisionVerification", { actorId, entries: entries.map(({ importId, expectedRevision }) => ({ importId, expectedRevision })) });
  });
  register("authoring.review_revision", z.object({ ...identity, evidence }), "review", "Submit explicit profile-specific Idea, Article or solution-collection review against this exact revision. Read reviewContext first. Actor, identity and revision are server-derived; no automatic approval.", async ({ bootstrapToken, ...input }) => {
    verify(input.kind, bootstrapToken);
    await readContext(input);
    return ports.invoke("reviewRevisionDraft", { actorId, ...input });
  });
  register("authoring.publish_release", z.object({ ...release, expectedPlanHash: revision }), "publish", "Explicitly publish the exact planned release atomically. Rechecks active actor, revisions, own review, dependencies and V4/V5 evidence; on failure the previous live release remains unchanged.", async ({ entries, bootstrapTokens, expectedPlanHash }) => {
    for (const item of entries) { verify(item.kind, bootstrapTokens[item.kind]); await readContext(item); }
    return ports.invoke("publishRevisionRelease", { actorId, entries: entries.map(({ importId, expectedRevision }) => ({ importId, expectedRevision })), expectedPlanHash });
  });
  register("authoring.list_revisions", z.object(identity), "read", "Read durable history and live/draft lineage for the exact observed Idea or Product revision. Historical artifacts remain immutable.", async ({ bootstrapToken, ...input }) => {
    verify(input.kind, bootstrapToken);
    await readContext(input);
    return ports.invoke("listRevisionHistory", { actorId, ...input });
  });
  register("authoring.restore_revision", z.object({ kind, bootstrapToken: bootstrap, historicalImportId: identifier, expectedRevision: revision, currentImportId: identifier, currentRevision: revision, responseMode }), "stage", "Restore historical content as a new draft based on the observed current live revision. Review and evidence gates remain required; this never rewrites history or publishes. Optional responseMode compact returns the successor identity and impact without full review context.", async ({ bootstrapToken, ...input }) => {
    verify(input.kind, bootstrapToken);
    await readContext({ kind: input.kind, importId: input.historicalImportId, expectedRevision: input.expectedRevision, responseMode: "compact" });
    await readContext({ kind: input.kind, importId: input.currentImportId, expectedRevision: input.currentRevision, responseMode: "compact" });
    return draftResult("restoreRevisionDraft", { actorId, ...input }, input.kind, bootstrapToken);
  });
}
