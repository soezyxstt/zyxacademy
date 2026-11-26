import { z } from "zod";
import { requireMcpScope, type McpPrincipal } from "./mcp-auth";
import { readMcpRunToken, verifyMcpExecutionBootstrap } from "./mcp-workflows";
import { authoringFailureDiagnostics } from "./diagnostics";
import { buildProductDraft, PRODUCT_DRAFT_LIMITS, productDraftInputSchema, type ProductDraftContext, type ProductDraftInput } from "./product-draft-builder";

const requestIdentity = {
  runToken: z.string().min(1),
  bootstrapToken: z.string().min(1),
  draftKey: z.string().min(1).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9:_-]*$/),
};
export const createProductDraftRequestSchema = z.object({
  ...requestIdentity,
  draft: productDraftInputSchema,
}).strict();
// Keep the MCP catalog small. Full content schemas are fetched on demand from
// the pinned productDraftInput descriptor, and still parsed strictly below.
export const createProductDraftToolSchema = z.object({
  ...requestIdentity,
  draft: z.object({ products: z.array(z.object({ productType: z.enum(["article", "diktat"]), title: z.string().trim().min(1).max(1000) }).passthrough()).min(1).max(PRODUCT_DRAFT_LIMITS.products) }).strict(),
}).strict();
export type CreateProductDraftRequest = z.infer<typeof createProductDraftRequestSchema>;
export type ProductDraftRun = ReturnType<typeof readMcpRunToken>;
export interface ProductDraftCreationPorts {
  loadContext(input: { run: ProductDraftRun; principal: McpPrincipal; draftKey: string; draft: ProductDraftInput }): Promise<ProductDraftContext>;
  stage(input: { principal: McpPrincipal; runToken: string; bootstrapToken: string; filename: string; bundleBase64: string }): Promise<Record<string, unknown>>;
}

/** Initial draft convenience path; existing admission, staging and release gates remain authoritative. */
export async function createProductDraft(input: unknown, principal: McpPrincipal, ports: ProductDraftCreationPorts): Promise<Record<string, unknown>> {
  requireMcpScope(principal, "authoring:stage");
  const rawDraft = input && typeof input === "object" && "draft" in input ? input.draft : null;
  if (Buffer.byteLength(JSON.stringify(rawDraft) ?? "null", "utf8") > PRODUCT_DRAFT_LIMITS.requestBytes) throw new Error("PRODUCT_DRAFT_REQUEST_TOO_LARGE");
  const validation = createProductDraftRequestSchema.safeParse(input);
  if (!validation.success) throw Object.assign(new Error("PRODUCT_DRAFT_INPUT_INVALID"), { issues: validation.error.issues });
  const parsed = validation.data;
  const run = readMcpRunToken(parsed.runToken);
  if (run.workflow !== "idea_product") throw new Error("AUTHORING_MCP_WORKFLOW_MISMATCH");
  verifyMcpExecutionBootstrap({ actorId: principal.actorId, sessionId: principal.sessionId,
    bootstrapToken: parsed.bootstrapToken, run, requiredStage: "product", expectedWorkflow: "idea_product" });
  const context = await ports.loadContext({ run, principal, draftKey: parsed.draftKey, draft: parsed.draft });
  const built = buildProductDraft(parsed.draft, context);
  if (!built.success) {
    return { ok: false, valid: false, staged: false, publicationReady: false, error: "PRODUCT_DRAFT_INPUT_INVALID",
      issues: built.issues, issueCount: built.issueCount,
      ...authoringFailureDiagnostics({ issues: built.issues }, { code: "PRODUCT_DRAFT_INPUT_INVALID" }) };
  }
  // ZIP and base64 are internal transport details, never model-authored input or response data.
  const staged = await ports.stage({ principal, runToken: parsed.runToken, bootstrapToken: parsed.bootstrapToken,
    filename: `${context.bundleId}.zip`, bundleBase64: Buffer.from(built.bytes).toString("base64") });
  return { ...staged, draftKey: parsed.draftKey,
    ...(staged.ok === false ? authoringFailureDiagnostics(staged, { code: typeof staged.error === "string" ? staged.error : "PRODUCT_DRAFT_INPUT_INVALID" }) : {}),
    ...(staged.ok === true ? { authoredProducts: built.bundle.products.map(product => ({ id: product.id, productType: product.productType, ...("title" in product ? { title: product.title } : {}) })),
      nextActions: ["authoring.get_edit_context", "authoring.verify_product_bundle", "authoring.get_product_review_context"] } : {}),
  };
}
