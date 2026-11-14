import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { assertMcpTarget, mcpEnvironmentIdentity } from "@/lib/authoring/mcp-environment";
import { requireMcpScope, resolveMcpAdmin, type McpPrincipal } from "@/lib/authoring/mcp-auth";
import { AdminMcpError, readAdminMutationReceipt } from "./mutations";
import { adminMcpFailure } from "./errors";
import { registerOperationDescriptor, registeredOperation, registeredOperations, sanitizeAdminOperationResult, type AdminOperationDescriptor } from "./operation-contracts";

const target = { expectedEnvironment: z.enum(["staging", "production", "local"]), expectedOrigin: z.url().max(2048) };
type Registrar = { registerTool(name: string, config: { description: string; inputSchema: Record<string, z.ZodType>; annotations: AdminOperationDescriptor["annotations"] }, callback: (input: Record<string, unknown>) => Promise<CallToolResult>): unknown };
const guides = [
  { domain: "blog", workflow: "blog_authoring", tools: ["blog.search", "blog.get_edit_context", "blog.validate", "blog.create", "blog.update", "blog.set_publication"], boundary: "Create as draft. Inspect public-page impact and explicitly authorize publication or edits to live content." },
  { domain: "forms", workflow: "forms_and_responses", tools: ["forms.get", "forms.preview", "forms.simulate_submission", "forms.create", "forms.update", "forms.set_acceptance", "forms.responses.summarize", "forms.responses.sheet_state", "forms.responses.export_sheet"], boundary: "Preview and simulation do not submit. Response data has separate permissions; manual spreadsheet conflicts require the user's exact overwrite consent." },
  { domain: "media", workflow: "media_for_content", tools: ["media.list", "media.get", "media.upload", "adminjobs.get"], boundary: "Use only served media paths. Small uploads are queued; await actual job completion. Do not infer a public URL from a private storage key." },
  { domain: "authoring", workflow: "existing_content_revisions", tools: ["authoring.get_edit_context", "authoring.create_revision", "authoring.patch_revision", "authoring.prepare_revision_verification", "authoring.review_revision", "authoring.plan_release", "authoring.publish_release", "authoring.list_revisions", "authoring.restore_revision"], boundary: "V3+ only. Current exact revisions, applicable evidence and explicit publication grants remain required; the Admin website is optional." },
  { domain: "adminjobs", workflow: "external_operation_recovery", tools: ["admin.operation_receipt", "adminjobs.get", "adminjobs.cancel", "adminjobs.reconcile"], boundary: "A database receipt does not attest provider delivery. Unknown provider outcomes require inspection and reconciliation, never automatic replay with a new key." },
] as const;

function workflows(server: McpServer, domain?: string) {
  const names = new Set(registeredOperations(server).map(operation => operation.name));
  return guides.filter(guide => (!domain || domain === guide.domain) && guide.tools.some(name => names.has(name))).map(guide => ({ ...guide, tools: guide.tools.filter(name => names.has(name)) }));
}
function availability(descriptor: AdminOperationDescriptor, principal: McpPrincipal) {
  const missingScopes = descriptor.requiredScopes.filter(scope => !principal.scopes.includes(scope));
  return { ...descriptor, requiredScope: descriptor.requiredScopes[0] ?? null, available: missingScopes.length === 0, missingScopes };
}
function success(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify({ ok: true, data }) }], structuredContent: { ok: true, data } };
}

/** Metadata discovery and committed-write recovery never dispatch arbitrary operations. */
export function registerAgentTools(server: McpServer, principal: McpPrincipal): void {
  function register<T extends z.ZodObject>(name: string, schema: T, description: string, execute: (input: z.infer<T>) => Promise<unknown>) {
    const descriptor = registerOperationDescriptor(server, { name, scope: [], description, schema });
    (server as unknown as Registrar).registerTool(name, { description, inputSchema: schema.shape, annotations: descriptor.annotations }, async raw => {
      try {
        const input = schema.strict().parse(raw) as z.infer<T> & { expectedEnvironment: "staging" | "production" | "local"; expectedOrigin: string };
        try { assertMcpTarget(input.expectedEnvironment, input.expectedOrigin); } catch { throw new AdminMcpError("MCP_TARGET_ENVIRONMENT_MISMATCH"); }
        await resolveMcpAdmin(principal);
        const data = await execute(input);
        if (Buffer.byteLength(JSON.stringify(data) ?? "") > 1000000) throw new AdminMcpError("REDUCE_PAGE_SIZE");
        return success(data);
      } catch (error) { return adminMcpFailure(error); }
    });
  }
  register("admin.capabilities", z.object({ ...target, domain: z.string().regex(/^[a-z][a-z0-9_]*$/).max(80).optional(), availableOnly: z.boolean().default(false), limit: z.number().int().min(1).max(50).default(25), offset: z.number().int().min(0).max(10000).default(0) }), "Discover registered operations, granted permissions, bounded workflows, confirmation and retry requirements. Metadata only; no business records are returned.", async input => {
    const all = registeredOperations(server).filter(operation => !input.domain || operation.domain === input.domain).map(operation => availability(operation, principal)).filter(operation => !input.availableOnly || operation.available);
    const page = all.slice(input.offset, input.offset + input.limit);
    return { ...mcpEnvironmentIdentity(), domains: [...new Set(registeredOperations(server).map(operation => operation.domain))], operations: page, pagination: { limit: input.limit, offset: input.offset, total: all.length, nextOffset: input.offset + page.length < all.length ? input.offset + page.length : null }, workflows: workflows(server, input.domain), boundaries: {
      activeAdminRequired: true,
      annotationsGrantAuthorization: false,
      mutationProtocol: { defaultDryRun: true, confirmationSeconds: 600, preserveRequestKeyOnRetry: true, receiptTool: "admin.operation_receipt" },
      websiteRequiredForAdvertisedOperations: false,
      sensitiveActions: "Role/status changes, credential disclosure, access revocation, broadcasts and reconciliation require explicit user authorization. Existing authorized tools retain their checks; the Admin surface remains an option for simple sensitive actions.",
      notAddedByThisExpansion: ["provider credential management", "OAuth account connection approval", "billing and pricing", "production deployment", "destructive bulk data contraction", "PKA"],
      authoringDiscovery: "Use workflow.get_contract and the current stage playbook for source-grounded authoring. Only explicitly registered revision operations appear in this discovery page.",
    } };
  });
  register("admin.operation_receipt", z.object({ ...target, operation: z.string().regex(/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/).max(200), requestKey: z.string().min(8).max(100), includeResult: z.boolean().default(false) }), "Recover this actor's committed database mutation by its original operation and request key. A missing receipt is not proof of rejection. External provider success is not attested by this receipt.", async input => {
    const descriptor = registeredOperation(server, input.operation);
    if (!descriptor || descriptor.mode !== "mutation" || descriptor.protocol !== "admin-plan") throw new AdminMcpError("OPERATION_RECEIPT_UNSUPPORTED");
    for (const scope of descriptor.requiredScopes) requireMcpScope(principal, scope);
    const receipt = await readAdminMutationReceipt(principal, input.operation, input.requestKey);
    const common = { operation: input.operation, requestKey: input.requestKey, statusSemantics: "Database commit only. This does not attest provider delivery or current target state." };
    if (!receipt) return { ...common, state: "not_recorded", databaseOutcome: "unknown", recovery: { action: "retry_same_request", receiptMayStillBeInFlight: true, preserveOperationPayloadAndRequestKey: true, newRequestKeyAllowedBecauseMissingReceipt: false, confirmation: "Refresh the signed plan if it expired; retry the identical operation, payload and requestKey." } };
    const include = input.includeResult && !input.operation.startsWith("adminjobs.");
    const result = receipt.afterSnapshot?.result;
    const queuedJobId = result && typeof result === "object" && "status" in result && result.status === "queued" && "id" in result && typeof result.id === "string" ? result.id : null;
    return { ...common, state: "committed", databaseOutcome: "committed", targetId: receipt.entityId, completedAt: receipt.createdAt, ...(include ? { result: sanitizeAdminOperationResult(input.operation, result, principal), resultIsHistorical: true } : {}), ...(input.includeResult && !include ? { resultOmitted: "Job receipt results are metadata-only. Use adminjobs.get with its current job permissions." } : {}), ...(queuedJobId ? { providerOutcome: "not_attested", nextActions: [{ tool: "adminjobs.get", arguments: { id: queuedJobId }, requiredScopes: ["jobs:read", ...descriptor.requiredScopes] }] } : {}) };
  });
}
