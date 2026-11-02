import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = resolve("tests/contracts");
const files = process.argv.length > 2
  ? process.argv.slice(2)
  : [...new Bun.Glob("tests/contracts/**/*.test.ts").scanSync()].sort();
assert.ok(files.length, "No contract tests selected");
for (const file of files) {
  const path = relative(root, resolve(file));
  assert.ok(path && !path.startsWith("..") && !path.includes(":"), "Tests must stay inside tests/contracts");
}
const directory = `artifacts/test-contracts/${Date.now()}`;
mkdirSync(directory, { recursive: true });
const environment: Record<string, string> = {
  NODE_ENV: "test", ZYX_POSTGRES_BUILD_PLACEHOLDER: "1", SKIP_ENV_VALIDATION: "1",
  DATABASE_URL: "postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder",
  BETTER_AUTH_SECRET: "isolated-contract-test-secret-with-no-external-access",
  BETTER_AUTH_URL: "http://localhost:3000", NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  GOOGLE_CLIENT_ID: "disabled-contract-tests", GOOGLE_CLIENT_SECRET: "disabled-contract-tests",
  RESEND_API_KEY: "disabled-contract-tests", GEMINI_API_KEY: "disabled-contract-tests",
  INNGEST_EVENT_KEY: "disabled-contract-tests", INNGEST_SIGNING_KEY: "disabled-contract-tests",
  FORCE_COLOR: "0", NO_COLOR: "1",
};
for (const key of ["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "COMSPEC", "USERPROFILE", "HOME", "LOCALAPPDATA", "APPDATA"]) {
  if (process.env[key]) environment[key] = process.env[key]!;
}
const results: Array<{file:string;exitCode:number;passed:number;failed:number;skipped:number;log:string}> = [];
const databaseIntegrationFiles = new Set([
  "admin-course-canonical-sync.test.ts", "assessment-canonical-sync.test.ts",
  "authoring-mcp-source-persistence.test.ts", "admin-ops-ai-lifecycle-integration.test.ts",
  "admin-ops-ai-runtime.test.ts", "prompt-executor.test.ts", "zyra-pedagogy-shadow.test.ts",
]);
let cursor = 0;
// PGlite's WASM instances exceed local memory when suites run concurrently.
await Promise.all(Array.from({ length: 1 }, async () => {
  while (cursor < files.length) {
    const index = cursor++, file = files[index];
    const preload = databaseIntegrationFiles.has(file.replaceAll("\\", "/").split("/").at(-1)!)
      ? ["--preload", "./tests/helpers/postgres-preload.ts"] : [];
    const child = Bun.spawn([process.execPath, "test", ...preload, "--timeout", "60000", file], { env: environment, stdout: "pipe", stderr: "pipe" });
    const timeout = setTimeout(() => child.kill(), 300000);
    const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    clearTimeout(timeout);
    const output = `${stdout}${stderr}`;
    const log = `${directory}/${index}.log`;
    writeFileSync(log, output);
    const count = (label: string) => Number(output.match(new RegExp(`(?:^|\\n)\\s*(\\d+) ${label}\\b`))?.[1] || 0);
    results.push({ file, exitCode, passed: count("pass"), failed: count("fail"), skipped: count("skip"), log });
    if (results.length % 25 === 0) console.log(JSON.stringify({ completed: results.length, total: files.length }));
  }
}));
results.sort((a,b)=>a.file.localeCompare(b.file));
writeFileSync(`${directory}/results.json`, JSON.stringify(results,null,2));
const summary = { files: results.length, passed: results.reduce((n,r)=>n+r.passed,0), failed: results.reduce((n,r)=>n+r.failed,0), skipped: results.reduce((n,r)=>n+r.skipped,0), failingFiles: results.filter(r=>r.exitCode!==0).map(r=>r.file), evidence: `${directory}/results.json` };
console.log(JSON.stringify(summary));
process.exitCode = summary.failingFiles.length ? 1 : 0;
