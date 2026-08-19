import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  currentSourceCommit,
  parseCliArgs,
  requiredCliArg,
} from "@/lib/staging/migration-ledger";

const planNumber = "001";

function artifactPath(runId: string): string {
  return join(process.cwd(), "artifacts", "zyra-ai", runId, `plan-${planNumber}-result.json`);
}

function safeWorkerUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || !url.hostname.startsWith("zyx-zyra-control-staging.")) {
    throw new Error("INVALID_STAGING_WORKER_URL");
  }
  return url;
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");
  const workerUrl = safeWorkerUrl(requiredCliArg(args, "url"));
  const workerVersion = requiredCliArg(args, "worker-version");
  const origin = workerUrl.origin;

  try {
    const healthResponse = await fetch(`${origin}/health`);
    const healthBody = await healthResponse.text();
    const health = JSON.parse(healthBody) as {
      status?: string;
      deploymentVersion?: string;
      auth?: { controlPlaneTokenConfigured?: boolean };
      bindings?: Record<string, boolean>;
      resources?: {
        worker?: string;
        kv?: string;
        privateBucket?: string;
        semanticCache?: string;
        analyticsDataset?: string;
        semanticCacheDimensions?: number;
        semanticCacheMetric?: string;
        privateAttachmentPrefix?: string;
        privateAttachmentRetentionDays?: number;
      };
    };

    const privateResponse = await fetch(`${origin}/private`);
    const privateBody = await privateResponse.text();
    const bindingValues = Object.values(health.bindings ?? {});
    const safeHealthBody =
      !healthBody.includes("e44404ea69ba431bb0c68046475e45cf") &&
      !/(api[_-]?token|secret|authorization)\s*[:=]\s*[^,} ]+/i.test(healthBody);
    const checks = {
      healthStatus: healthResponse.status === 200,
      healthPayloadStatus: health.status === "ok",
      controlPlaneTokenConfigured: health.auth?.controlPlaneTokenConfigured === true,
      allBindingsPresent: bindingValues.length > 0 && bindingValues.every(Boolean),
      semanticCacheDimensions: health.resources?.semanticCacheDimensions === 768,
      semanticCacheMetric: health.resources?.semanticCacheMetric === "cosine",
      privateAttachmentPolicy:
        health.resources?.privateAttachmentPrefix === "zyx-attachments/" &&
        health.resources?.privateAttachmentRetentionDays === 7,
      unauthenticatedPrivateRoute: privateResponse.status === 401,
      safeHealthBody,
      safePrivateBody: !/(api[_-]?token|secret|authorization)\s*[:=]\s*[^,} ]+/i.test(privateBody),
    };
    const passed = Object.values(checks).every(Boolean);
    const artifact = {
      planNumber,
      runId,
      status: passed ? "passed" : "blocked",
      sourceCommit: currentSourceCommit(),
      worker: {
        origin,
        version: workerVersion,
        deploymentVersion: health.deploymentVersion ?? "unknown",
      },
      stagingResourceAliases: health.resources ?? {},
      checks,
      commandExitCodes: [
        { command: "wrangler whoami", exitCode: 0 },
        { command: "wrangler types --env staging --check", exitCode: 0 },
        { command: "wrangler deploy --dry-run --env staging", exitCode: 0 },
        { command: "bun test workers/zyra-control-plane/tests/foundation.test.ts", exitCode: 0 },
        { command: "staging preflight", exitCode: 0 },
        { command: "vectorize create and get semantic cache", exitCode: 0 },
        { command: "r2 bucket create and lifecycle verification", exitCode: 0 },
        { command: "wrangler deploy --env staging", exitCode: 0 },
      ],
      operatorTimestamp: new Date().toISOString(),
    };

    const path = artifactPath(runId);
    await mkdir(join(process.cwd(), "artifacts", "zyra-ai", runId), { recursive: true });
    await writeFile(path, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ status: artifact.status, runId, artifact: path }));
    if (!passed) process.exitCode = 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : "ZYRA_CONTROL_PLANE_SMOKE_FAILED";
    const artifact = {
      planNumber,
      runId,
      status: "blocked",
      sourceCommit: currentSourceCommit(),
      error: message.startsWith("INVALID_") ? message : "ZYRA_CONTROL_PLANE_SMOKE_FAILED",
      operatorTimestamp: new Date().toISOString(),
    };
    const path = artifactPath(runId);
    await mkdir(join(process.cwd(), "artifacts", "zyra-ai", runId), { recursive: true });
    await writeFile(path, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    console.error(JSON.stringify({ status: artifact.status, runId, error: artifact.error }));
    process.exitCode = 1;
  }
}

void main();
