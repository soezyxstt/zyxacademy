import { z } from "zod";

const identifier = z.string().trim().min(1).max(256);
const revision = z.string().regex(/^[a-f0-9]{64}$/);
const executionSchema = z.object({ runId: identifier, runToken: z.string().min(1) }).passthrough();
const identitySchema = z.object({ importId: identifier, revision, execution: executionSchema.optional() }).strict();
const contextSchema = z.object({ kind: z.literal("product"), importId: identifier, revision,
  stagingRunId: identifier.nullable().optional(), execution: executionSchema.optional(),
}).passthrough();

export type ProductAuthoringIdentity = z.infer<typeof identitySchema>;
export type ProductAuthoringTarget = { entityType: string; entityId: string; sectionId?: string; blockId?: string; itemId?: string };
export type ProductAuthoringPatch = {
  op: "set" | "add" | "remove" | "move";
  target: ProductAuthoringTarget;
  field?: string;
  value?: unknown;
  beforeId?: string | null;
};
export type ProductAuthoringTransport = (name: string, input: Record<string, unknown>) => Promise<unknown>;
export type ProductAuthoringResponse = Record<string, unknown>;

/** Keeps server diagnostics intact; callers decide whether and how to recover. */
export class ProductAuthoringClientError extends Error {
  readonly code: string;
  constructor(code: string, readonly details: ProductAuthoringResponse = {}) {
    super(code);
    this.name = "ProductAuthoringClientError";
    this.code = code;
  }
}

function record(value: unknown): value is ProductAuthoringResponse {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function toolPayload(response: unknown): ProductAuthoringResponse {
  if (!record(response)) throw new ProductAuthoringClientError("PRODUCT_AUTHORING_RESPONSE_INVALID");
  let payload: ProductAuthoringResponse | undefined;
  if (record(response.structuredContent)) payload = response.structuredContent;
  else if (Array.isArray(response.content)) {
    const text = response.content.find(value => record(value) && value.type === "text" && typeof value.text === "string");
    if (text && record(text)) {
      try { const parsed: unknown = JSON.parse(String(text.text)); if (record(parsed)) payload = parsed; }
      catch { /* Require a structured JSON result, never guess a revision from prose. */ }
    }
  } else payload = response;
  if (!payload) throw new ProductAuthoringClientError("PRODUCT_AUTHORING_RESPONSE_INVALID");
  if (response.isError === true || payload.ok === false) {
    throw new ProductAuthoringClientError(typeof payload.error === "string" ? payload.error : "PRODUCT_AUTHORING_REQUEST_FAILED", payload);
  }
  if (payload.ok !== true) throw new ProductAuthoringClientError("PRODUCT_AUTHORING_RESPONSE_INVALID");
  return payload;
}

/**
 * Thin opt-in client for the existing revision MCP tools. It carries the last
 * observed revision forward only after success. It never refreshes a stale
 * revision, retries a write, supplies a review, or publishes automatically.
 */
export function createProductAuthoringClient(options: {
  transport: ProductAuthoringTransport;
  bootstrapToken: string;
  identity: ProductAuthoringIdentity;
}) {
  let identity = identitySchema.parse(options.identity);
  let bootstrapToken = z.string().min(1).parse(options.bootstrapToken);
  let busy = false;
  function args() {
    return { kind: "product" as const, bootstrapToken, importId: identity.importId, expectedRevision: identity.revision };
  }
  async function operation(name: string, input: () => Record<string, unknown>, updateIdentity = false) {
    if (busy) throw new ProductAuthoringClientError("PRODUCT_AUTHORING_OPERATION_IN_FLIGHT");
    busy = true;
    try {
      const response = toolPayload(await options.transport(name, input()));
      if (updateIdentity) {
        const context = contextSchema.safeParse(response);
        if (!context.success || (context.data.stagingRunId && context.data.execution?.runId !== context.data.stagingRunId)) {
          throw new ProductAuthoringClientError("PRODUCT_AUTHORING_RESPONSE_INVALID");
        }
        identity = { importId: context.data.importId, revision: context.data.revision,
          ...(context.data.execution ? { execution: context.data.execution } : {}),
        };
      }
      return response;
    } finally { busy = false; }
  }
  return {
    /** Returned snapshots are detached so callers cannot overwrite the session. */
    snapshot(): ProductAuthoringIdentity { return structuredClone(identity); },
    setBootstrapToken(value: string) {
      if (busy) throw new ProductAuthoringClientError("PRODUCT_AUTHORING_OPERATION_IN_FLIGHT");
      bootstrapToken = z.string().min(1).parse(value);
      // Run tokens are session-bound. Renew them with an exact context read.
      identity = { importId: identity.importId, revision: identity.revision };
    },
    read(target?: ProductAuthoringTarget) {
      return operation("authoring.get_edit_context", () => ({ ...args(), responseMode: "compact", ...(target ? { target } : {}) }), true);
    },
    createRevision(entityIds?: string[]) {
      return operation("authoring.create_revision", () => ({ kind: "product", bootstrapToken, baseImportId: identity.importId,
        expectedRevision: identity.revision, responseMode: "compact", ...(entityIds ? { entityIds } : {}),
      }), true);
    },
    patch(operations: ProductAuthoringPatch[]) {
      return operation("authoring.patch_revision", () => ({ ...args(), responseMode: "compact", operations }), true);
    },
    planRelease() {
      return operation("authoring.plan_release", () => ({ entries: [{ kind: "product", importId: identity.importId, expectedRevision: identity.revision }], bootstrapTokens: { product: bootstrapToken } }));
    },
    /** Build the public verifier request from an observed plan; never infer its hashes from a bundle revision. */
    verificationInput(plan: { contentHash: string; planHash: string }) {
      if (busy) throw new ProductAuthoringClientError("PRODUCT_AUTHORING_OPERATION_IN_FLIGHT");
      if (!identity.execution) throw new ProductAuthoringClientError("PRODUCT_AUTHORING_EXECUTION_REQUIRED", { remediation: "Read the exact edit context to obtain a current-session execution identity." });
      const observed = z.object({ contentHash: revision, planHash: revision }).strict().parse(plan);
      return { importId: identity.importId, bootstrapToken, runToken: identity.execution.runToken,
        expectedContentHash: observed.contentHash, expectedPlanHash: observed.planHash,
      };
    },
  };
}
