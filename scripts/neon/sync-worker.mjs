import { readFile, writeFile } from "node:fs/promises";
import { workerTarget } from "./worker-targets.mjs";

const target = workerTarget(process.argv[2]);
const deployed = JSON.parse(await readFile(`${target.output}/after.json`, "utf8"));
if (deployed.branch !== target.branch || deployed.slug !== target.slug) throw new Error("COMPUTE_TARGET_MISMATCH");
const url = new URL("/api/inngest", deployed.url);
if (url.origin !== target.origin) throw new Error("COMPUTE_ORIGIN_MISMATCH");
const response = await fetch(url, { method: "PUT", signal: AbortSignal.timeout(120_000) });
if (!response.ok) throw new Error(`INNGEST_SYNC_FAILED:${response.status}`);
await writeFile(`${target.output}/sync.json`, JSON.stringify({ branch: deployed.branch, slug: deployed.slug, status: response.status }) + "\n");
console.log(`${target.name} Inngest sync accepted`, response.status);
