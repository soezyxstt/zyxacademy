import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { workerTarget, assertWorkerEnvironment } from "./worker-targets.mjs";

const target = workerTarget("production");
const config = JSON.parse(await readFile(`${target.output}/.env.production.json`, "utf8"));
assertWorkerEnvironment(target, config);
Object.assign(process.env, config);
const headers = { Authorization: `Bearer ${config.INNGEST_SIGNING_KEY}`, "X-Inngest-Env": config.INNGEST_ENV };
const report: unknown[] = [];
function shape(value: unknown, depth = 0): unknown {
  if (depth > 3 || value === null || typeof value !== "object") return { type: typeof value, length: typeof value === "string" ? value.length : undefined };
  return Array.isArray(value) ? { array: value.length, first: shape(value[0], depth + 1) }
    : Object.fromEntries(Object.entries(value).slice(0, 20).map(([key, item]) => [key, shape(item, depth + 1)]));
}
function safeFacts(value: unknown, ownedAssessment: boolean, facts: unknown[] = [], depth = 0): unknown[] {
  if (depth > 30 || value === null) return facts;
  if (typeof value === "string" && (value.startsWith("{") || value.startsWith("["))) { try { safeFacts(JSON.parse(value), ownedAssessment, facts, depth + 1); } catch {} }
  if (Array.isArray(value)) for (const item of value) safeFacts(item, ownedAssessment, facts, depth + 1);
  else if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    if (typeof object.message === "string") {
      const patterns = [/\b[A-Za-z_$][\w.$]* is not defined\b/, /\b[A-Za-z_$][\w.$]* is not a function\b/,
        /column "?[a-zA-Z0-9_]+"?(?: of relation "[a-zA-Z0-9_]+")? does not exist/,
        /relation "[a-zA-Z0-9_]+" does not exist/, /violates (?:foreign key|unique|check) constraint "[a-zA-Z0-9_]+"/,
        /Vectorize canonical worker \/v2\/\w+ failed \(\d+\)/, /EMBEDDING_FAILED|DIMENSION_MISMATCH|StepExecutionTimeout|FUNCTION_INVOCATION_TIMEOUT/];
      const diagnostic = patterns.map(pattern => object.message.match(pattern)?.[0]).find(Boolean);
      facts.push({ errorName: typeof object.name === "string" && /^[\w.-]{1,80}$/.test(object.name) ? object.name : undefined,
        errorCode: typeof object.code === "string" && /^[\w.-]{1,80}$/.test(object.code) ? object.code : undefined, diagnostic: diagnostic ?? "message withheld" });
    }
    if (ownedAssessment && Array.isArray(object.createdConcepts) && object.createdConcepts.every(item => item && typeof item === "object"
      && /^[a-f0-9-]{36}$/.test(item.conceptId) && /^cl-[a-f0-9-]{36}$/.test(item.localizationId))) facts.push({ createdConcepts: object.createdConcepts });
    for (const item of Object.values(object)) safeFacts(item, ownedAssessment, facts, depth + 1);
  }
  return facts;
}
for (const [functionId, runId] of [["assessment-ingest-worker", "01M739D273Q2ZPN9N1MGB6XW67"], ["admin-ops-knowledge-sync-worker", "01M73AKHPQSVA4NH7PPMZBXW2Z"]]) {
  for (const path of [`v2/runs/${runId}?include=output`, `v1/runs/${runId}`, `v2/runs/${runId}/trace?include=output`]) {
    try {
      const response = await fetch(`https://api.inngest.com/${path}`, { headers, signal: AbortSignal.timeout(20_000) });
      const body = await response.json();
      report.push({ functionId, runId, path, status: response.status, shape: shape(body), facts: safeFacts(body, functionId === "assessment-ingest-worker") });
    } catch (error) { report.push({ functionId, runId, path, errorName: error instanceof Error ? error.name : "unknown" }); }
    await writeFile(`${target.output}/worker-runs.json`, JSON.stringify(report, null, 2));
  }
}
console.log(JSON.stringify(report));
