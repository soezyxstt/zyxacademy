import { mock } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
mock.module("server-only", () => ({}));
mock.module("@/lib/storage", () => ({ storage: {} }));
const runtimeModule = await import("@/lib/compute/product-v4-runtime-binding");
const runtime = await runtimeModule.readProductV4RuntimeFingerprint();
if (process.argv[2] === "runtime") {
  process.stdout.write(JSON.stringify(runtime));
} else {
  const baseUrl = process.argv[2];
  const output = process.argv[3];
  if (!baseUrl || !output) throw new Error("FIXTURE_INPUT_REQUIRED");
  const [{ admittedFormativeVerificationFixture }, verification, runner, helper] = await Promise.all([
    import("./formative-verification-data"), import("@/lib/bundle/product-v4-verification"), import("@/lib/compute/product-v4-browser-runner"), import("@/lib/compute/product-v4-formative-verification"),
  ]);
  const { bundle, assets } = await admittedFormativeVerificationFixture();
  const hash = "a".repeat(64);
  const plan = verification.deriveProductV4VerificationPlan({ bundle, binding: { importId: "fixture", courseId: bundle.manifest.courseId, runId: "fixture", revision: 1, ...runtime, dependencyChecksum: hash, assetChecksum: hash, policyRevision: "fixture" } });
  const fields = verification.formativeDocumentFields(bundle.products);
  const requirements = plan.requirements.filter(item => item.state === "formative-document-field");
  if (requirements.length !== 8) throw new Error("FIXTURE_REQUIREMENT_COUNT_INVALID");
  await mkdir(output, { recursive: true });
  const results: Array<{ field: string; width: number; status: string; observed: string; paths: string[] }> = [];
  try {
    for (const requirement of requirements) {
      const field = fields.find(item => item.target === requirement.target)!;
      const name = field.field.startsWith("prompt:") ? "prompt" : field.field.startsWith("option:") ? "option" : field.field;
      const preview = JSON.stringify(helper.formativeVerificationPreview(field, "b".repeat(32)));
      const explanation = fields.find(item => item.field === "explanation")!;
      if (preview.includes(explanation.spec.documentSha256) || ((name === "answer" || name === "explanation") && preview.includes(field.spec.documentSha256))) throw new Error("FIXTURE_HIDDEN_PREVIEW_EXPOSED");
      if (name === "answer" || name === "explanation") {
        const mockResponses = helper.formativeVerificationResponses(field, "only-after-reveal");
        if (mockResponses.handle("reveal", "POST", { articleId: "verification", articleVersion: 1, sectionId: field.section.id, blockId: "wrong" })) throw new Error("FIXTURE_WRONG_SCOPE_ACCEPTED");
      }
      const result = await runner.executeBrowserProductV4Check({ plan, bundle, requirement, baseUrl, interactiveDocumentAssets: assets });
      const paths: string[] = [];
      for (const artifact of result.artifacts.filter(item => item.mediaType === "image/png")) {
        const path = join(output, `${name}-${requirement.viewport!.width}-${paths.length + 1}.png`);
        await writeFile(path, artifact.bytes);
        paths.push(path);
      }
      results.push({ field: name, width: requirement.viewport!.width, status: result.status, observed: result.observed, paths });
    }
  } finally { await runner.closeProductV4BrowserRunner(); }
  process.stdout.write(JSON.stringify(results));
}
