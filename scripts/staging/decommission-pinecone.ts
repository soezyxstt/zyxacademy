import { join } from "node:path";
import {
  assertExactStagingPineconeTarget,
  stagingPineconeFingerprint,
  STAGING_PINECONE_NOT_PROVISIONED,
} from "@/lib/staging/cutover-contract";
import { currentSourceCommit, parseCliArgs, sha256Text, writeArtifact } from "@/lib/staging/migration-ledger";
import { assertStagingEnvironment, parseEnvFile, safeGuardError } from "@/lib/staging/staging-guard";

type ExternalDeletion = "not_requested" | "operator_confirmation_required" | "executed" | "not_provisioned";

async function pineconeRequest(indexName: string, apiKey: string, method: "GET" | "DELETE"): Promise<Record<string, unknown> | null> {
  const response = await fetch(`https://api.pinecone.io/indexes/${encodeURIComponent(indexName)}`, {
    method,
    headers: {
      Accept: "application/json",
      "Api-Key": apiKey,
    },
  });
  if (!response.ok) throw new Error(`PINECONE_${method}_FAILED_${response.status}`);
  if (response.status === 204) return null;
  const payload: unknown = await response.json();
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = typeof args["run-id"] === "string" ? args["run-id"] : `plan016-decommission-${Date.now()}`;
  const dryRun = args["dry-run"] === true;
  const notProvisioned = args["not-provisioned"] === true;
  const confirmation = typeof args.confirm === "string" ? args.confirm : null;
  try {
    const stagingEnv = parseEnvFile(join(process.cwd(), ".env.staging"));
    const guard = assertStagingEnvironment({
      productionEnv: parseEnvFile(join(process.cwd(), ".env.prod")),
      requireMutation: !dryRun,
      requiredResources: ["database", "authUrl"],
    });
    const indexName = (notProvisioned ? stagingEnv.PINECONE_INDEX_NAME : process.env.PINECONE_INDEX_NAME)?.trim();
    const apiKey = (notProvisioned ? stagingEnv.PINECONE_API_KEY : process.env.PINECONE_API_KEY)?.trim();
    if (notProvisioned) {
      if (indexName || apiKey) throw new Error("PINECONE_NOT_PROVISIONED_CONFLICTS_WITH_CONFIGURED_TARGET");
    } else {
      if (!indexName) throw new Error("PINECONE_STAGING_INDEX_NAME_REQUIRED");
      assertExactStagingPineconeTarget(indexName);
    }
    const fingerprint = stagingPineconeFingerprint(notProvisioned ? STAGING_PINECONE_NOT_PROVISIONED : indexName!);
    const confirmationPhrase = process.env.PINECONE_DECOMMISSION_CONFIRMATION;
    const approved = confirmation === fingerprint && confirmationPhrase === "I_CONFIRM_STAGING_PINECONE_ONLY";
    let externalDeletion: ExternalDeletion = notProvisioned
      ? "not_provisioned"
      : dryRun
        ? "not_requested"
        : "operator_confirmation_required";
    if (!notProvisioned && !dryRun && approved) {
      if (!apiKey) throw new Error("PINECONE_API_KEY_REQUIRED_FOR_CONFIRMED_DECOMMISSION");
      const description = await pineconeRequest(indexName!, apiKey, "GET");
      const describedName = typeof description?.name === "string" ? description.name : "";
      if (describedName !== indexName) throw new Error("PINECONE_DESCRIBED_TARGET_MISMATCH");
      await pineconeRequest(indexName!, apiKey, "DELETE");
      externalDeletion = "executed";
    }
    const artifact = {
      planNumber: "016",
      runId,
      status: dryRun || externalDeletion === "executed" || externalDeletion === "not_provisioned" ? "passed" : "blocked",
      sourceCommit: currentSourceCommit(),
      stagingResourceFingerprints: guard.resources,
      stagingIndexFingerprint: fingerprint,
      stagingPineconeState: notProvisioned ? "not_provisioned" : "provisioned",
      stagingPineconeEnv: {
        indexNamePresent: Boolean(stagingEnv.PINECONE_INDEX_NAME?.trim()),
        apiKeyPresent: Boolean(stagingEnv.PINECONE_API_KEY?.trim()),
      },
      outOfScopePineconeEnvFiles: [".env.local", ".env.prod"],
      indexNameDigest: indexName ? sha256Text(indexName).slice(0, 16) : null,
      dryRun,
      exactTarget: notProvisioned || Boolean(indexName),
      productionTarget: false,
      wildcardTarget: false,
      externalDeletion,
      preservedVectorizeResources: ["zyx-vectors-staging", "zyx-edu"],
      operatorTimestamp: new Date().toISOString(),
    };
    await writeArtifact(runId, "plan-016-pinecone-decommission.json", artifact);
    console.log(JSON.stringify({ status: artifact.status, runId, stagingPineconeState: artifact.stagingPineconeState, stagingIndexFingerprint: fingerprint, dryRun, preservedVectorizeResources: artifact.preservedVectorizeResources }));
    if (artifact.status === "blocked") process.exitCode = 1;
  } catch (error) {
    const safe = safeGuardError(error);
    console.error(JSON.stringify({ status: "blocked", runId, ...safe }));
    process.exitCode = 1;
  }
}

void main();
