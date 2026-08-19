import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { GoogleGenAI } from "@google/genai";
import {
  createProfiledEmbeddingAdapter,
} from "@/lib/ai/provider/embedding-adapter";
import { createGeminiGenerateAdapter } from "@/lib/ai/provider/gemini-generate-adapter";
import { createGeminiInteractionsAdapter } from "@/lib/ai/provider/gemini-interactions-adapter";
import {
  getProjectAliases,
  MODEL_REGISTRY,
  type ModelId,
  type ModelRegistryEntry,
} from "@/lib/ai/provider/model-registry";
import { ProviderAdapterError } from "@/lib/ai/provider/errors";

const MAX_REQUESTS = 40;
const PROBE_TEXT = "Staging provider contract probe. Return the word ready.";

interface ProbeRecord {
  readonly projectAlias: string;
  readonly keySlot: string;
  readonly modelId: string;
  readonly family: string;
  readonly status: "passed" | "failed" | "skipped";
  readonly latencyMs?: number;
  readonly dimensions?: number;
  readonly errorCode?: string;
  readonly retryClassification?: string;
  readonly httpStatus?: number;
}

interface StoredProbeArtifact {
  readonly records: readonly ProbeRecord[];
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function p95(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
}

function getStagingKeys(): Array<{ keySlot: string; value: string | undefined }> {
  return [
    { keySlot: "key1", value: process.env.GEMINI_API_KEY ?? process.env.GEMINI_API_KEY_1 },
    { keySlot: "key2", value: process.env.GEMINI_API_KEY_2 },
    { keySlot: "key3", value: process.env.GEMINI_API_KEY_3 },
    { keySlot: "key4", value: process.env.GEMINI_API_KEY_4 },
  ];
}

function getProjectAliasesForProbe(): readonly string[] {
  return getProjectAliases({
    GEMINI_PROJECT_ALIAS_1: process.env.GEMINI_PROJECT_ALIAS_1,
    GEMINI_PROJECT_ALIAS_2: process.env.GEMINI_PROJECT_ALIAS_2,
    GEMINI_PROJECT_ALIAS_3: process.env.GEMINI_PROJECT_ALIAS_3,
    GEMINI_PROJECT_ALIAS_4: process.env.GEMINI_PROJECT_ALIAS_4,
  });
}

function probeModels(): ModelRegistryEntry[] {
  return Object.values(MODEL_REGISTRY).filter(
    (entry) => entry.stability !== "legacy" && (entry.ordinaryRoutingAllowed || entry.stability === "quarantined"),
  );
}

async function probeOne(entry: ModelRegistryEntry, key: string): Promise<{ latencyMs: number; dimensions?: number }> {
  const client = new GoogleGenAI({ apiKey: key });
  const startedAt = Date.now();
  if (entry.family === "embedding") {
    const adapter = createProfiledEmbeddingAdapter({ profileId: "canonical-content-v2", clients: [{ models: client.models }] });
    const result = await adapter.embed({ text: PROBE_TEXT, title: "staging-probe" });
    return { latencyMs: Date.now() - startedAt, dimensions: result.values.length };
  }

  const request = {
    modelId: entry.id,
    parts: [{ type: "text" as const, text: PROBE_TEXT }],
    allowQuarantined: true,
  };
  if (entry.family === "interactions") {
    await createGeminiInteractionsAdapter({ interactions: client.interactions }).generate(request);
  } else {
    await createGeminiGenerateAdapter({ models: client.models }).generate(request);
  }
  return { latencyMs: Date.now() - startedAt };
}

function mockRecords(aliases: readonly string[]): ProbeRecord[] {
  return probeModels().flatMap((entry) => aliases.map((projectAlias, projectIndex) => ({
    projectAlias,
    keySlot: `key${projectIndex + 1}`,
    modelId: entry.id,
    family: entry.family,
    status: "passed" as const,
    latencyMs: 0,
    ...(entry.family === "embedding" ? { dimensions: entry.dimensions } : {}),
  })));
}

async function main(): Promise<void> {
  const mock = process.argv.includes("--mock");
  const real = process.argv.includes("--real");
  if (mock === real) throw new Error("choose exactly one of --mock or --real");

  const maxRequestsText = argValue("--max-requests");
  if (real && maxRequestsText === undefined) throw new Error("--real requires an explicit --max-requests value");
  const maxRequests = maxRequestsText === undefined ? MAX_REQUESTS : Number(maxRequestsText);
  if (!Number.isInteger(maxRequests) || maxRequests < 1 || maxRequests > MAX_REQUESTS) {
    throw new Error(`--max-requests must be an integer between 1 and ${MAX_REQUESTS}`);
  }

  const runId = argValue("--run-id") ?? `plan002-probe-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  if (!/^[A-Za-z0-9._-]+$/.test(runId)) throw new Error("--run-id contains unsupported characters");
  const retryFrom = argValue("--retry-from");
  if (retryFrom && (!real || maxRequests !== 1)) {
    throw new Error("--retry-from requires --real --max-requests 1");
  }

  const aliases = getProjectAliasesForProbe();
  const records: ProbeRecord[] = mock ? mockRecords(aliases) : [];
  let networkCalls = 0;

  if (real) {
    const configuredAliases = [
      process.env.GEMINI_PROJECT_ALIAS_1,
      process.env.GEMINI_PROJECT_ALIAS_2,
      process.env.GEMINI_PROJECT_ALIAS_3,
      process.env.GEMINI_PROJECT_ALIAS_4,
    ];
    if (configuredAliases.some((alias) => !alias)) {
      throw new Error("staging real probe requires four non-secret project aliases; no provider call was made");
    }

    const keySlots = getStagingKeys();
    if (keySlots.some((slot) => !slot.value)) {
      throw new Error("staging real probe requires four Gemini key slots; no provider call was made");
    }

    let jobs = probeModels().flatMap((entry) => keySlots.map((slot, index) => ({
        entry,
        keySlot: slot.keySlot,
        key: slot.value as string,
        projectAlias: aliases[index],
      })));

    if (retryFrom) {
      const source = JSON.parse(await Bun.file(retryFrom).text()) as StoredProbeArtifact;
      const failed = source.records.filter((record) => record.status === "failed");
      if (failed.length !== 1) throw new Error("retry artifact must contain exactly one failed record");
      const target = failed[0];
      if (target.retryClassification !== "transient" || target.httpStatus === undefined || target.httpStatus < 500) {
        throw new Error("retry artifact is not an eligible transient provider failure");
      }
      const keyIndex = Number(target.keySlot.replace("key", "")) - 1;
      const keySlot = keySlots[keyIndex];
      const entry = MODEL_REGISTRY[target.modelId as ModelId];
      if (!keySlot || !keySlot.value || !entry || aliases[keyIndex] !== target.projectAlias) {
        throw new Error("retry artifact target does not match the current staging registry");
      }
      jobs = [{ entry, keySlot: keySlot.keySlot, key: keySlot.value, projectAlias: aliases[keyIndex] }];
    }

    for (const job of jobs.slice(0, maxRequests)) {
      networkCalls++;
      try {
        const result = await probeOne(job.entry, job.key);
        records.push({
          projectAlias: job.projectAlias,
          keySlot: job.keySlot,
          modelId: job.entry.id,
          family: job.entry.family,
          status: "passed",
          latencyMs: result.latencyMs,
          dimensions: result.dimensions,
        });
      } catch (error) {
        const typed = error instanceof ProviderAdapterError ? error : new ProviderAdapterError({
          code: "PROVIDER_ERROR",
          message: "staging provider probe failed",
          retryClassification: "unknown",
          modelId: job.entry.id,
          cause: error,
        });
        records.push({
          projectAlias: job.projectAlias,
          keySlot: job.keySlot,
          modelId: job.entry.id,
          family: job.entry.family,
          status: "failed",
          errorCode: typed.code,
          retryClassification: typed.retryClassification,
          httpStatus: typed.httpStatus,
        });
      }
    }
  }

  if (records.length > maxRequests && real) throw new Error("probe request cap exceeded");
  const latencyValues = records.flatMap((record) => record.latencyMs === undefined ? [] : [record.latencyMs]);
  const quarantinedFlashLite = records.filter((record) => record.modelId === "gemini-3.5-flash-lite");
  const sampleSize = quarantinedFlashLite.length;
  const successCount = quarantinedFlashLite.filter((record) => record.status === "passed").length;
  const successRate = sampleSize === 0 ? null : successCount / sampleSize;
  const releaseGate = mock
    ? "not_evidence"
    : sampleSize < 20
      ? "insufficient_sample"
      : successRate !== null && successRate >= 0.95 && p95(quarantinedFlashLite.flatMap((record) => record.latencyMs === undefined ? [] : [record.latencyMs])) !== null && (p95(quarantinedFlashLite.flatMap((record) => record.latencyMs === undefined ? [] : [record.latencyMs])) as number) < 4_000
        ? "passed"
        : "failed";

  const artifact = {
    status: records.every((record) => record.status !== "failed") ? "passed" : "failed",
    mode: mock ? "mock" : retryFrom ? "real-retry" : "real",
    package: "@google/genai",
    packageVersion: "2.10.0",
    maxRequests,
    networkCalls,
    requestCount: records.length,
    p95LatencyMs: p95(latencyValues),
    quarantinedFlashLiteReleaseGate: { sampleSize, successRate, status: releaseGate },
    records,
    secretsPrinted: false,
    authenticatedUrlsPrinted: false,
  };

  const directory = resolve(process.cwd(), "artifacts", "zyra-ai", runId);
  await mkdir(directory, { recursive: true });
  const artifactPath = resolve(directory, "plan-002-model-probe.json");
  await Bun.write(artifactPath, JSON.stringify(artifact, null, 2));
  console.log(`probe status=${artifact.status} mode=${artifact.mode} requests=${records.length} networkCalls=${networkCalls} artifact=${artifactPath}`);
}

await main();
