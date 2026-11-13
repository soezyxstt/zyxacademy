import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditMutasi, mataKuliah } from "@/db/schema";
import { requireMcpScope, type McpPrincipal } from "./mcp-auth";
import { readMcpRunToken, verifyMcpExecutionBootstrap } from "./mcp-workflows";
import { resolveStoredSourceFile } from "./mcp-source-files";
import { extractSourceFigure, extractSourceFigureSchema, getSourceFigure, getSourceFigureJob, listSourceFigures, sourceFigureListSchema, sourceFigureRefSchema } from "./source-figures";
import { getProductBundleImport, parseStagedProductBundle } from "@/lib/bundle/product-staging";
import { getProductV4Verification, getProductV4VerificationReadiness, requestProductV4Verification } from "@/lib/bundle/product-v4-verification-service";

import { insufficientScopeChallenge } from "./mcp-oauth";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const context = { runToken: z.string().min(1), bootstrapToken: z.string().min(1) };
const defaults = {
  resolveFile: resolveStoredSourceFile, extract: extractSourceFigure, figureJob: getSourceFigureJob, list: listSourceFigures, figure: getSourceFigure,
  getImport: getProductBundleImport, readiness: getProductV4VerificationReadiness, request: requestProductV4Verification, verification: getProductV4Verification,
  async assertStagingScope(importId: string, run: ReturnType<typeof readMcpRunToken>) {
    const row = await getProductBundleImport(importId);
    const bundle = await parseStagedProductBundle(importId);
    const [staging] = await db.select({ correlationId: auditMutasi.correlationId, afterSnapshot: auditMutasi.afterSnapshot }).from(auditMutasi).where(and(eq(auditMutasi.entityType, "product_bundle"), eq(auditMutasi.entityId, importId), inArray(auditMutasi.action, ["draft_created", "draft_replaced"]))).orderBy(desc(auditMutasi.createdAt), desc(auditMutasi.id)).limit(1);
    if (!row || row.version !== 4 || !run.chapterId || bundle.checksum !== row.checksum || bundle.manifest.courseId !== run.courseId || bundle.products.some(product => product.chapterId !== run.chapterId) || staging?.correlationId !== run.runId || (staging.afterSnapshot as { checksum?: string } | null)?.checksum !== row.checksum) throw new Error("PRODUCT_V4_VERIFICATION_CONFLICT");
  },
  async courseAliases(courseId: string) {
    const rows = await db.select({ id: mataKuliah.id, legacyCourseId: mataKuliah.legacyCourseId }).from(mataKuliah).where(or(eq(mataKuliah.id, courseId), eq(mataKuliah.legacyCourseId, courseId)));
    return new Set(rows.flatMap(row => [row.id, ...(row.legacyCourseId ? [row.legacyCourseId] : [])]));
  },
};
type Ports = typeof defaults;
type Registrar = { registerTool(name: string, config: { description: string; inputSchema: Record<string, z.ZodType>; annotations: { readOnlyHint: boolean; destructiveHint: false; openWorldHint: false } }, callback: (input: Record<string, unknown>) => Promise<CallToolResult>): unknown };
const result = (payload: Record<string, unknown>, isError = false): CallToolResult => ({ content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload, ...(isError ? { isError: true } : {}) });
const safeCodes = /^(AUTHORING_MCP_(TOKEN_INVALID|TOKEN_EXPIRED|SCOPE_REQUIRED|BOOTSTRAP_[A-Z_]+|LEGACY_RUN_RESTART_REQUIRED|WORKFLOW_MISMATCH)|SOURCE_FIGURE_[A-Z_]+|PRODUCT_V4_VERIFICATION_CONFLICT|PRODUCT_BUNDLE_NOT_FOUND)$/;

export function productV4RequestErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const code = message.split(":")[0];
  if (/^PRODUCT_V4_[A-Z_]+$/.test(code)) return code;
  if (error && typeof error === "object" && "code" in error && ["ENOENT", "MODULE_NOT_FOUND", "ERR_MODULE_NOT_FOUND", "ERR_PACKAGE_PATH_NOT_EXPORTED"].includes(String(error.code))) return "PRODUCT_V4_RUNTIME_ASSET_UNAVAILABLE";
  return safeCodes.test(message) ? message : message.startsWith("AUTHORING_MCP_SCOPE_REQUIRED") ? "AUTHORING_MCP_SCOPE_REQUIRED" : "AUTHORING_MCP_V4_REQUEST_FAILED";
}

export function registerProductV4Tools(server: McpServer, principal: McpPrincipal, overrides: Partial<Ports> = {}) {
  const ports = { ...defaults, ...overrides };
  // SDK schema declarations lag the installed Zod version; runtime consumes these Zod schemas directly.
  const registrar = server as unknown as Registrar;
  function register<T extends z.ZodObject>(name: string, schema: T, mutation: boolean, description: string, execute: (input: z.infer<T>, run: ReturnType<typeof readMcpRunToken>) => Promise<unknown>) {
    registrar.registerTool(name, { description, inputSchema: schema.shape, annotations: { readOnlyHint: !mutation, destructiveHint: false, openWorldHint: false } }, async raw => {
      try {
        requireMcpScope(principal, "authoring:read");
        if (mutation) requireMcpScope(principal, "authoring:stage");
        const input = schema.strict().parse(raw) as z.infer<T>;
        const run = readMcpRunToken(String(raw.runToken));
        if (run.workflow !== "idea_product") throw new Error("AUTHORING_MCP_WORKFLOW_MISMATCH");
        const bootstrap = verifyMcpExecutionBootstrap({ actorId: principal.actorId, sessionId: principal.sessionId, bootstrapToken: String(raw.bootstrapToken), run, requiredStage: raw.stage === "source" ? "source" : "product", expectedWorkflow: "idea_product", requireBoundRun: true });
        if (bootstrap.mode !== "verified") throw new Error("AUTHORING_MCP_BOOTSTRAP_REQUIRED");
        return result({ ok: true, result: await execute(input, run) });
      } catch (error) {
        const code = productV4RequestErrorCode(error);
        console.error("[authoring-v4]", { operation: name, code });
        if (code === "AUTHORING_MCP_SCOPE_REQUIRED") {
          const requiredScope = error instanceof Error ? error.message.split(":").slice(1).join(":") : undefined;
          if (requiredScope) return { ...result({ ok: false, error: code, requiredScope, remediation: "Reauthorize with the union of current scopes and the required scope, then retry with the new token." }, true), _meta: { "mcp/www_authenticate": [insufficientScopeChallenge(requiredScope)] } };
        }
        return result({ ok: false, error: code }, true);
      }
    });
  }
  async function fileScope(fileKey: string, run: ReturnType<typeof readMcpRunToken>) {
    const { row, token } = await ports.resolveFile(fileKey);
    if (token.courseId !== run.courseId || row.courseId !== token.legacyCourseId || (run.chapterId && token.chapterId !== run.chapterId)) throw new Error("SOURCE_FIGURE_NOT_IN_SCOPE");
  }
  async function importScope(importId: string, run: ReturnType<typeof readMcpRunToken>) {
    const row = await ports.getImport(importId);
    if (!row) throw new Error("PRODUCT_BUNDLE_NOT_FOUND");
    if (!(await ports.courseAliases(run.courseId)).has(row.courseId ?? "")) throw new Error("SOURCE_FIGURE_NOT_IN_SCOPE");
    await ports.assertStagingScope(importId, run);
  }
  register("source.extract_figure", extractSourceFigureSchema.extend({ ...context, stage: z.enum(["source", "product"]).default("source") }), true, "Extract a scoped immutable source figure with preview and print variants.", async (input, run) => {
    if (run.sourcePackChecksum && input.sourcePackChecksum !== run.sourcePackChecksum) throw new Error("SOURCE_FIGURE_NOT_IN_SCOPE");
    await fileScope(input.fileKey, run); return ports.extract(input, principal);
  });
  register("source.get_figure_job", sourceFigureRefSchema.extend({ ...context, stage: z.enum(["source", "product"]).default("source") }), false, "Read an actor and session scoped figure extraction job.", async (input, run) => {
    await fileScope(input.fileKey, run); return ports.figureJob(input, principal);
  });
  register("source.list_figures", sourceFigureListSchema.extend({ ...context, stage: z.enum(["source", "product"]).default("source") }), false, "List verified figures for the selected scoped source revision.", async (input, run) => {
    await fileScope(input.fileKey, run); return ports.list(input);
  });
  register("source.get_figure", sourceFigureRefSchema.extend({ ...context, stage: z.enum(["source", "product"]).default("source") }), false, "Read a scoped figure manifest and short lived delivery handles.", async (input, run) => {
    await fileScope(input.fileKey, run); return ports.figure(input);
  });
  register("authoring.verify_product_bundle", z.object({ ...context, importId: z.string().min(1), expectedContentHash: hash, expectedPlanHash: hash.optional(), retry: z.boolean().optional() }), true, "Request server derived verification for the current V4 content hash.", async (input, run) => {
    await importScope(input.importId, run);
    const current = await ports.readiness(input.importId, run.runId);
    if (current.plan.contentHash !== input.expectedContentHash || (input.expectedPlanHash && current.plan.planHash !== input.expectedPlanHash)) throw new Error("PRODUCT_V4_VERIFICATION_CONFLICT");
    return ports.request({ importId: input.importId, runId: run.runId, expectedPlanHash: current.plan.planHash, retry: input.retry });
  });
  register("authoring.get_verification", z.object({ ...context, importId: z.string().min(1), planHash: hash }), false, "Read current server verification evidence for the exact plan hash.", async (input, run) => {
    await importScope(input.importId, run); return ports.verification({ importId: input.importId, runId: run.runId, planHash: input.planHash });
  });
}




