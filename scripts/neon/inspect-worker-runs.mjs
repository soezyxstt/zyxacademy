import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { workerTarget, assertWorkerEnvironment } from "./worker-targets.mjs";

const target = workerTarget(process.argv[2]);
const config = JSON.parse(await readFile(`${target.output}/.env.${target.name}.json`, "utf8"));
assertWorkerEnvironment(target, config);
const headers = { Authorization: `Bearer ${config.INNGEST_SIGNING_KEY}`, "X-Inngest-Env": config.INNGEST_ENV };
const ids = [
  "admin-operations-outbox", "source-read-page", "source-figure-extraction", "product-v4-verification",
  "vector-sync-worker", "vector-sync-cron-worker", "bulk-chapter-generator", "mastery-recompute-worker",
  "idea-mastery-recompute-v1", "quiz-feedback-worker", "course-analytics-snapshot-cron",
  "weekly-reflection-cron", "mastery-snapshot-cron", "assessment-ingest-worker", "content-quality-audit-cron",
  "question-generation-worker", "student-quiz-analytics-worker", "sync-search-documents",
  "product-diktat-pdf-worker", "admin-ops-knowledge-sync-worker", "diktat-pdf-worker", "pdf-thumbnail-worker",
];
const result = [];
for (const functionId of ids) {
  const response = await fetch(`https://api.inngest.com/v2/apps/zyx-academy/functions/${functionId}/runs?limit=3&include=output`, {
    headers, signal: AbortSignal.timeout(30_000),
  });
  assert.equal(response.status, 200, `Run inspection failed: ${functionId}`);
  const body = await response.json();
  const runs = (body.data ?? []).map(run => ({
    id: run.id, status: run.status, startedAt: run.startedAt, endedAt: run.endedAt,
    outputPresent: Object.hasOwn(run, "output"), outputType: typeof run.output,
    outputKeys: run.output && typeof run.output === "object" ? Object.keys(run.output) : [],
    outputNumbers: Object.fromEntries(Object.entries(run.output ?? {}).filter(([,value]) => typeof value === "number")),
    businessFailures: Object.fromEntries(Object.entries(run.output ?? {})
      .filter(([key, value]) => /^(failed|failedCount|errors|errorCount)$/.test(key))
      .map(([key, value]) => [key, typeof value === "number" ? value : Array.isArray(value) ? value.length : value ? 1 : 0])),
  }));
  result.push({ functionId, runs });
}
await writeFile(`${target.output}/worker-runs.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
