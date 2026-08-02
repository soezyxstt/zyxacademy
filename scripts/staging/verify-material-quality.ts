import { readFile } from "node:fs/promises";
import { articleDocumentSchema } from "@/lib/materials/article-contract";
import { evaluateArticleQuality } from "@/lib/materials/quality-gates";
import { diktatDocumentSchema } from "@/lib/materials/diktat-contract";
import { evaluateDiktatQuality } from "@/lib/materials/quality-gates";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}
async function main(): Promise<void> {
  const runId = argument("--run-id");
  const input = argument("--input");
  if (!runId) throw new Error("verify-material-quality requires --run-id");
  if (!input) {
    console.log(JSON.stringify({ status: "blocked", runId, code: "QUALITY_INPUT_MISSING", message: "Use --input with a read-only preview report." }));
    process.exitCode = 1;
    return;
  }
  const value = JSON.parse(await readFile(input, "utf8")) as { article?: unknown; diktat?: unknown };
  const article = articleDocumentSchema.parse(value.article);
  const articleQuality = evaluateArticleQuality(article);
  const diktat = value.diktat === undefined ? null : diktatDocumentSchema.parse(value.diktat);
  const diktatQuality = diktat ? evaluateDiktatQuality(article, diktat) : null;
  const passed = articleQuality.passed && (diktatQuality === null || diktatQuality.passed);
  console.log(JSON.stringify({ status: passed ? "passed" : "blocked", runId, articleQuality, diktatQuality }, null, 2));
  if (!passed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ status: "blocked", code: "QUALITY_VERIFY_FAILED", message: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});
