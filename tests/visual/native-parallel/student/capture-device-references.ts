import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = "tests/visual/native-parallel/student";
const output = "artifacts/student-evidence/reference";
const groups: Record<string, { productFixture?: string; webOrigin?: string; webSuite?: string }> =
  JSON.parse(readFileSync(join(root, "matched-reference-groups.json"), "utf8"));
const suites = new Map<string, string>();
mkdirSync(output, { recursive: true });
for (const [group, config] of Object.entries(groups)) {
  if (config.productFixture) {
    // These reference screens require a signed session and a seeded PostgreSQL
    // database. The comparator binds them to the committed seed and response.
    cpSync(join(root, group, "web"), join(output, group), { recursive: true });
    continue;
  }
  const suite = config.webSuite ?? group;
  if (!config.webOrigin || (suites.has(suite) && suites.get(suite) !== config.webOrigin)) {
    throw new Error(`Missing or conflicting Playwright origin for Student group ${group}`);
  }
  suites.set(suite, config.webOrigin);
}
for (const [suite, origin] of suites) {
  const result = spawnSync("node", [
    "node_modules/playwright/cli.js", "test", join(root, `${suite}-reference.spec.ts`),
    "--project=mobile-380", "--reporter=list", "--output", join(output, suite),
  ], { stdio: "inherit", env: { ...process.env, PLAYWRIGHT_BASE_URL: origin } });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exitCode = 1;
}
