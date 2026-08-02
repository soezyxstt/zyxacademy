import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { assertStagingEnvironment, parseEnvFile } from "@/lib/staging/staging-guard";
import { articleDocumentSchema } from "@/lib/materials/article-contract";
import { compileDiktatFromArticle } from "@/lib/materials/diktat-contract";
import { diktatDocumentSchema } from "@/lib/materials/diktat-contract";
import { evaluateArticleQuality, evaluateDiktatQuality } from "@/lib/materials/quality-gates";
import { plan009ArtifactPath, validatePlan009Report, type Plan009QualityReport } from "@/lib/materials/staging-quality-report";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  const runId = argument("--run-id");
  const input = argument("--input") ?? plan009ArtifactPath(runId ?? "");
  if (!runId) throw new Error("QUALITY_VERIFY_ARGUMENTS_INVALID");
  assertStagingEnvironment({ productionEnv: parseEnvFile(join(process.cwd(), ".env.prod")), requiredResources: ["database", "authUrl"] });
  let report: Plan009QualityReport;
  try {
    report = JSON.parse(await readFile(input, "utf8")) as Plan009QualityReport;
  } catch {
    console.log(JSON.stringify({ status: "blocked", runId, code: "QUALITY_REPORT_MISSING", input }, null, 2));
    process.exitCode = 1;
    return;
  }
  const failureCodes = new Set(validatePlan009Report(report));
  try {
    if (!report.article.document || !report.diktat.document) throw new Error("QUALITY_DOCUMENT_MISSING");
    const article = articleDocumentSchema.parse(report.article.document);
    const diktat = diktatDocumentSchema.parse(report.diktat.document);
    const articleQuality = evaluateArticleQuality(article);
    const diktatQuality = evaluateDiktatQuality(article, diktat);
    const recomputedDiktat = compileDiktatFromArticle(article, diktat.id).document;
    if (JSON.stringify(recomputedDiktat) !== JSON.stringify(diktat)) failureCodes.add("QUALITY_DIKTAT_RECOMPILE_MISMATCH");
    if (!articleQuality.passed || articleQuality.score !== 100) failureCodes.add("QUALITY_ARTICLE_NOT_100_PERCENT");
    if (!diktatQuality.passed || diktatQuality.score !== 100) failureCodes.add("QUALITY_DIKTAT_NOT_100_PERCENT");
  } catch (error) {
    failureCodes.add(error instanceof Error ? error.message.split(":")[0] : "QUALITY_VERIFY_FAILED");
  }
  const sortedFailureCodes = [...failureCodes].sort();
  const status = sortedFailureCodes.length === 0 ? "passed" : "blocked";
  console.log(JSON.stringify({ status, runId, input, productCount: report.productCount, fixtureMode: report.fixtureMode, failureCodes: sortedFailureCodes, readOnly: report.readOnly }, null, 2));
  if (status !== "passed") process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ status: "blocked", code: "QUALITY_VERIFY_FAILED", message: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});
