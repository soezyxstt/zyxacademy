import { z } from "zod";
import type { DerivedContentReview } from "./revision-derived";

const identifier = z.string().trim().min(1).max(256);
const revision = z.string().regex(/^[a-f0-9]{64}$/);
const executionSchema = z.object({ runId: identifier, runToken: z.string().min(1) }).passthrough();
const identitySchema = z.object({ importId: identifier, revision, execution: executionSchema.optional() }).strict();
const contextSchema = z.object({ kind: z.enum(["idea", "product"]), importId: identifier, revision,
  stagingRunId: identifier.nullable().optional(), execution: executionSchema.optional(),
}).passthrough();

export type AuthoringRevisionIdentity = z.infer<typeof identitySchema>;
export type AuthoringRevisionTarget = { entityType: string; entityId: string; sectionId?: string; blockId?: string; itemId?: string; unitId?: string };
export type AuthoringRevisionPatch = {
  op: "set" | "add" | "remove" | "move";
  target: AuthoringRevisionTarget;
  field?: string;
  value?: unknown;
  beforeId?: string | null;
};
export type AuthoringRevisionPatchOptions = {
  derivedContentReviews?: DerivedContentReview[];
  refreshPrintEvidence?: boolean;
};
export type AuthoringRevisionTransport = (name: string, input: Record<string, unknown>) => Promise<unknown>;
export type AuthoringRevisionResponse = Record<string, unknown>;

/** Keeps server diagnostics intact; callers decide whether and how to recover. */
export class AuthoringRevisionClientError extends Error {
  readonly code: string;
  constructor(code: string, readonly details: AuthoringRevisionResponse = {}) {
    super(code);
    this.name = code.startsWith("IDEA_") ? "IdeaAuthoringClientError" : "ProductAuthoringClientError";
    this.code = code;
  }
}

function record(value: unknown): value is AuthoringRevisionResponse {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function toolPayload(response: unknown, kind: "idea" | "product"): AuthoringRevisionResponse {
  const error = (code: string, details?: AuthoringRevisionResponse) => new AuthoringRevisionClientError(`${kind.toUpperCase()}_AUTHORING_${code}`, details);
  if (!record(response)) throw error("RESPONSE_INVALID");
  let payload: AuthoringRevisionResponse | undefined;
  if (record(response.structuredContent)) payload = response.structuredContent;
  else if (Array.isArray(response.content)) {
    const text = response.content.find(value => record(value) && value.type === "text" && typeof value.text === "string");
    if (text && record(text)) {
      try { const parsed: unknown = JSON.parse(String(text.text)); if (record(parsed)) payload = parsed; }
      catch { /* Require a structured JSON result, never guess a revision from prose. */ }
    }
  } else payload = response;
  if (!payload) throw error("RESPONSE_INVALID");
  if (response.isError === true || payload.ok === false) {
    throw new AuthoringRevisionClientError(typeof payload.error === "string" ? payload.error : `${kind.toUpperCase()}_AUTHORING_REQUEST_FAILED`, payload);
  }
  if (payload.ok !== true) throw error("RESPONSE_INVALID");
  return payload;
}

/**
 * Thin opt-in client for the existing revision MCP tools. It carries the last
 * observed revision forward only after success. It never refreshes a stale
 * revision, retries a write, supplies a review, or publishes automatically.
 */
export function createRevisionAuthoringClient(options: {
  kind: "idea" | "product";
  transport: AuthoringRevisionTransport;
  bootstrapToken: string;
  identity: AuthoringRevisionIdentity;
}) {
  const kind = options.kind;
  const error = (code: string, details?: AuthoringRevisionResponse) => new AuthoringRevisionClientError(`${kind.toUpperCase()}_AUTHORING_${code}`, details);
  let identity = identitySchema.parse(options.identity);
  let bootstrapToken = z.string().min(1).parse(options.bootstrapToken);
  let busy = false;
  function args() {
    return { kind, bootstrapToken, importId: identity.importId, expectedRevision: identity.revision };
  }
  async function operation(name: string, input: () => Record<string, unknown>, updateIdentity?: "exact" | "successor") {
    if (busy) throw error("OPERATION_IN_FLIGHT");
    busy = true;
    try {
      const response = toolPayload(await options.transport(name, input()), kind);
      if (updateIdentity) {
        const context = contextSchema.safeParse(response);
        if (!context.success || context.data.kind !== kind || (updateIdentity === "exact" && (context.data.importId !== identity.importId || context.data.revision !== identity.revision)) || (context.data.stagingRunId && context.data.execution?.runId !== context.data.stagingRunId)) {
          throw error("RESPONSE_INVALID");
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
    snapshot(): AuthoringRevisionIdentity { return structuredClone(identity); },
    setBootstrapToken(value: string) {
      if (busy) throw error("OPERATION_IN_FLIGHT");
      bootstrapToken = z.string().min(1).parse(value);
      // Run tokens are session-bound. Renew them with an exact context read.
      identity = { importId: identity.importId, revision: identity.revision };
    },
    read(target?: AuthoringRevisionTarget) {
      return operation("authoring.get_edit_context", () => ({ ...args(), responseMode: "compact", ...(target ? { target } : {}) }), "exact");
    },
    readFull() {
      return operation("authoring.get_edit_context", () => ({ ...args(), responseMode: "full" }), "exact");
    },
    createRevision(entityIds?: string[]) {
      return operation("authoring.create_revision", () => ({ kind, bootstrapToken, baseImportId: identity.importId,
        expectedRevision: identity.revision, responseMode: "compact", ...(entityIds ? { entityIds } : {}),
      }), "successor");
    },
    /** Reviews and evidence refresh are explicit caller decisions, never automatic recovery. */
    patch(operations: AuthoringRevisionPatch[], patchOptions: AuthoringRevisionPatchOptions = {}) {
      return operation("authoring.patch_revision", () => ({ ...args(), responseMode: "compact", operations,
        ...(patchOptions.derivedContentReviews ? { derivedContentReviews: patchOptions.derivedContentReviews } : {}),
        ...(patchOptions.refreshPrintEvidence !== undefined ? { refreshPrintEvidence: patchOptions.refreshPrintEvidence } : {}),
      }), "successor");
    },
    planRelease() {
      return operation("authoring.plan_release", () => ({ entries: [{ kind, importId: identity.importId, expectedRevision: identity.revision }], bootstrapTokens: { [kind]: bootstrapToken } }));
    },
    /** Build the public verifier request from an observed plan; never infer its hashes from a bundle revision. */
    verificationInput(plan: { contentHash: string; planHash: string }) {
      if (busy) throw error("OPERATION_IN_FLIGHT");
      if (kind !== "product") throw error("VERIFICATION_UNSUPPORTED");
      if (!identity.execution) throw error("EXECUTION_REQUIRED", { remediation: "Read the exact edit context to obtain a current-session execution identity." });
      const observed = z.object({ contentHash: revision, planHash: revision }).strict().parse(plan);
      return { importId: identity.importId, bootstrapToken, runToken: identity.execution.runToken,
        expectedContentHash: observed.contentHash, expectedPlanHash: observed.planHash,
      };
    },
  };
}
