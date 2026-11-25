import { z } from "zod";
import { authoringFailureDiagnostics } from "./diagnostics";
import { requireMcpScope, type McpPrincipal } from "./mcp-auth";
import { readMcpRunToken, verifyMcpExecutionBootstrap } from "./mcp-workflows";
import { buildIdeaDraft, IDEA_DRAFT_LIMITS, ideaDraftInputSchema, type IdeaDraftContext } from "./idea-draft-builder";

const identity = { runToken: z.string().min(1), bootstrapToken: z.string().min(1), draftKey: z.string().min(1).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9:_-]*$/) };
export const createIdeaDraftRequestSchema = z.object({ ...identity, draft: ideaDraftInputSchema }).strict();
// The complete schema is available by its checksum-pinned descriptor. Catalog
// brevity never weakens the complete validation in createIdeaDraft below.
export const createIdeaDraftToolSchema = z.object({ ...identity, draft: z.object({
  ideas: z.array(z.object({ key: z.string().min(1), canonicalStatement: z.string().min(1) }).passthrough()).min(1).max(IDEA_DRAFT_LIMITS.ideas),
  learningSections: z.array(z.object({ key: z.string().min(1), title: z.string().min(1) }).passthrough()).min(1).max(IDEA_DRAFT_LIMITS.sections),
  relations: z.array(z.object({ sourceIdeaKey: z.string().min(1), targetIdeaKey: z.string().min(1) }).passthrough()).max(IDEA_DRAFT_LIMITS.relations).optional(),
}).strict() }).strict();
export type CreateIdeaDraftRequest = z.input<typeof createIdeaDraftRequestSchema>;
export type IdeaDraftRun = ReturnType<typeof readMcpRunToken>;
export interface IdeaDraftCreationPorts {
  loadContext(input: { run: IdeaDraftRun; principal: McpPrincipal; draftKey: string }): Promise<IdeaDraftContext>;
  stage(input: { principal: McpPrincipal; runToken: string; bootstrapToken: string; filename: string; bundleBase64: string }): Promise<Record<string, unknown>>;
}

export async function createIdeaDraft(input: unknown, principal: McpPrincipal, ports: IdeaDraftCreationPorts): Promise<Record<string, unknown>> {
  requireMcpScope(principal, "authoring:stage");
  const rawDraft = input && typeof input === "object" && "draft" in input ? input.draft : null;
  if (Buffer.byteLength(JSON.stringify(rawDraft) ?? "null", "utf8") > IDEA_DRAFT_LIMITS.requestBytes) throw new Error("IDEA_DRAFT_REQUEST_TOO_LARGE");
  const parsed = createIdeaDraftRequestSchema.safeParse(input);
  if (!parsed.success) throw Object.assign(new Error("IDEA_DRAFT_INPUT_INVALID"), { issues: parsed.error.issues });
  const request = parsed.data;
  const run = readMcpRunToken(request.runToken);
  if (run.workflow !== "idea_product") throw new Error("AUTHORING_MCP_WORKFLOW_MISMATCH");
  verifyMcpExecutionBootstrap({ actorId: principal.actorId, sessionId: principal.sessionId,
    bootstrapToken: request.bootstrapToken, run, requiredStage: "idea", expectedWorkflow: "idea_product" });
  if (!run.chapterId || !run.sourcePackId || !run.sourcePackChecksum) throw new Error("AUTHORING_MCP_SOURCE_PACK_REQUIRED");
  if (request.draft.ideas.reduce((count, idea) => count + idea.sourceRefs.length, 0) > IDEA_DRAFT_LIMITS.sourceRefs) throw new Error("IDEA_DRAFT_REFERENCE_LIMIT");
  const context = await ports.loadContext({ run, principal, draftKey: request.draftKey });
  const built = buildIdeaDraft(request.draft, context);
  if (!built.success) return { ok: false, valid: false, staged: false, publicationReady: false, error: "IDEA_DRAFT_INPUT_INVALID",
    issues: built.issues, issueCount: built.issueCount, ...authoringFailureDiagnostics({ issues: built.issues }, { code: "IDEA_DRAFT_INPUT_INVALID" }) };
  const staged = await ports.stage({ principal, runToken: request.runToken, bootstrapToken: request.bootstrapToken,
    filename: `${context.bundleId}.zip`, bundleBase64: Buffer.from(built.bytes).toString("base64") });
  return { ...staged, draftKey: request.draftKey, publicationReady: false,
    ...(staged.ok === false ? authoringFailureDiagnostics(staged, { code: typeof staged.error === "string" ? staged.error : "IDEA_DRAFT_INPUT_INVALID" }) : {}),
    ...(staged.ok === true ? { authoredIdeas: Object.entries(built.ideaIds).map(([key, id]) => ({ key, id })),
      authoredSections: Object.entries(built.sectionIds).map(([key, id]) => ({ key, id })),
      nextActions: ["authoring.get_edit_context", "authoring.get_idea_review_context"] } : {}),
  };
}
