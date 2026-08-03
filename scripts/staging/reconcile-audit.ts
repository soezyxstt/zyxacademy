import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { alurKonten, auditMutasi } from "@/db/schema";
import { currentSourceCommit, parseCliArgs, readArtifact, writeArtifact } from "@/lib/staging/migration-ledger";
import { assertStagingEnvironment, parseEnvFile, safeGuardError } from "@/lib/staging/staging-guard";

type E2eArtifact = {
  planNumber?: string;
  runId?: string;
  status?: string;
  fixture?: { entityType?: string; entityId?: string; version?: number };
  transitions?: Array<{ requestId?: string; state?: string }>;
};

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = typeof args["run-id"] === "string" ? args["run-id"] : "";
  try {
    if (!runId) throw new Error("Missing --run-id");
    const guard = assertStagingEnvironment({
      productionEnv: parseEnvFile(join(process.cwd(), ".env.prod")),
      requiredResources: ["database", "authUrl"],
    });
    const e2e = await readArtifact<E2eArtifact>(runId, "plan-014-e2e.json");
    const entityType = e2e.fixture?.entityType;
    const entityId = e2e.fixture?.entityId;
    const version = e2e.fixture?.version;
    if (e2e.planNumber !== "014" || e2e.runId !== runId || e2e.status !== "passed" || !entityType || !entityId || version !== 1) {
      throw new Error("PLAN_014_E2E_ARTIFACT_INVALID");
    }
    const workflowId = `${entityType}:${entityId}:${version}`;
    const [workflow] = await db.select().from(alurKonten).where(eq(alurKonten.id, workflowId)).limit(1);
    const auditRows = await db.select({
      id: auditMutasi.id,
      action: auditMutasi.action,
      correlationId: auditMutasi.correlationId,
      afterSnapshot: auditMutasi.afterSnapshot,
    }).from(auditMutasi).where(and(eq(auditMutasi.entityType, entityType), eq(auditMutasi.entityId, entityId)));
    const expectedActions = e2e.transitions?.map((transition) => `workflow:${transition.requestId?.split(":").slice(1).join(":") ?? ""}`) ?? [];
    const findings = [
      ...(workflow?.state !== "published" ? [{ code: "WORKFLOW_STATE_MISMATCH" }] : []),
      ...(auditRows.length !== e2e.transitions?.length ? [{ code: "AUDIT_COUNT_MISMATCH" }] : []),
      ...auditRows.flatMap((row) => {
        const envelope = row.afterSnapshot as Record<string, unknown> | null;
        return envelope?.auditSchemaVersion === "content-workflow-v1" && envelope?.courseId && envelope?.entityVersion === 1 && envelope?.requestId && envelope?.reason
          ? []
          : [{ code: "AUDIT_ENVELOPE_INCOMPLETE", id: row.id }];
      }),
    ];
    const artifact = {
      planNumber: "014",
      runId,
      status: findings.length === 0 ? "passed" : "blocked",
      sourceCommit: currentSourceCommit(),
      stagingResourceFingerprints: guard.resources,
      workflowId,
      finalState: workflow?.state ?? null,
      auditCount: auditRows.length,
      auditActionCount: expectedActions.length,
      findings,
      legacyRowsWritten: 0,
      operatorTimestamp: new Date().toISOString(),
    };
    await writeArtifact(runId, "plan-014-audit.json", artifact);
    await writeArtifact(runId, "plan-014-result.json", artifact);
    console.log(JSON.stringify({ status: artifact.status, runId, auditCount: auditRows.length, findings: findings.length }));
    if (artifact.status !== "passed") process.exitCode = 1;
  } catch (error) {
    const safe = safeGuardError(error);
    console.error(JSON.stringify({ status: "blocked", runId, ...safe }));
    process.exitCode = 1;
  }
}

void main();
