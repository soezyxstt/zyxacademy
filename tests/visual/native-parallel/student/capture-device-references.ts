import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { cpSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = "tests/visual/native-parallel/student";
const output = "artifacts/student-evidence/reference";
const groups: Record<string, { productFixture?: string; webOrigin?: string; webSuite?: string; sourcePaths?: string[] }> =
  JSON.parse(readFileSync(join(root, "matched-reference-groups.json"), "utf8"));
const signedReview: { referencePath: string; platform: string; states: Record<string, unknown> } =
  JSON.parse(readFileSync(join(root, "signed-assessment-review.json"), "utf8"));
const suites = new Map<string, string>();
mkdirSync(output, { recursive: true });
const signedReference = join(output, signedReview.referencePath);
mkdirSync(join(signedReference, signedReview.platform), { recursive: true });
cpSync(join(root, signedReview.referencePath, "http.json"), join(signedReference, "http.json"));
for (const name of ["manifest.json", ...Object.keys(signedReview.states).map(state => `review-${state}.png`)]) {
  const filename = join(signedReview.platform, name);
  cpSync(join(root, signedReview.referencePath, filename), join(signedReference, filename));
}
for (const [group, config] of Object.entries(groups)) {
  if (config.productFixture && config.sourcePaths) {
    // A copied signed capture must still match its original source. Playwright
    // suites below render the checkout again and record their own source hashes.
    const current = Object.fromEntries(config.sourcePaths.map(path => [path, createHash("sha256").update(readFileSync(path)).digest("hex")]));
    for (const platform of ["android", "ios"]) {
      const file = join(root, group, "web", platform, `${group}-reference.json`);
      const reference = JSON.parse(readFileSync(file, "utf8"));
      if (!isDeepStrictEqual(current, reference.sourceDigests)) {
        throw new Error(`Refresh ${file} from the production and fixture sources before capturing device evidence.`);
      }
    }
  }
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
