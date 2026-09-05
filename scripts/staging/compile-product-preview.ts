import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { asalIde, ide, mataKuliah, potonganSumber, sumberMateri } from "@/db/schema";
import type { ProductEntity } from "@/lib/bundle/product-validator";
import { assertStagingEnvironment, parseEnvFile } from "@/lib/staging/staging-guard";
import { compileArticleProduct, compileDiktatFromApprovedArticle } from "@/lib/materials/compiler";
import type { ArticleBlock } from "@/lib/materials/article-contract";
import { plan009ArtifactPath, PLAN009_REPORT_SCHEMA, validatePlan009Report, type Plan009QualityReport } from "@/lib/materials/staging-quality-report";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function emptyQuality() {
  return { passed: false, score: 0, issues: [{ code: "QUALITY_FIXTURE_MISSING", message: "No canonical fixture is available." }], metrics: { requiredCoveragePercent: 0, traceableBlockPercent: 0 } };
}

function emptyReport(runId: string, courseId: string, failureCodes: string[], canonicalCourseId: string | null = null): Plan009QualityReport {
  return {
    schemaVersion: PLAN009_REPORT_SCHEMA,
    plan: "009",
    runId,
    courseId,
    canonicalCourseId,
    status: "blocked",
    fixtureMode: "none",
    productCount: 0,
    article: { document: null, markdown: "", astHash: "", quality: emptyQuality() },
    diktat: { document: null, compression: null, quality: { ...emptyQuality(), metrics: { ideaCoveragePercent: 0, compressionLossFreePercent: 0 } } },
    deterministic: { hashesMatch: false, markdownMatch: false, astMatch: false },
    readOnly: { mutationStatus: "read_only", writesAttempted: 0, rowsChanged: 0 },
    failureCodes: [...new Set(failureCodes)].sort(),
  };
}

type CanonicalRow = {
  idea: typeof ide.$inferSelect;
  provenance: typeof asalIde.$inferSelect;
  chunk: typeof potonganSumber.$inferSelect;
  source: typeof sumberMateri.$inferSelect;
};

async function loadCanonicalRows(courseId: string): Promise<{ canonicalCourseId: string | null; rows: CanonicalRow[]; fallback: boolean }> {
  const courseMatches = await db
    .select({ id: mataKuliah.id })
    .from(mataKuliah)
    .where(or(eq(mataKuliah.id, courseId), eq(mataKuliah.legacyCourseId, courseId), eq(mataKuliah.code, courseId)))
    .orderBy(asc(mataKuliah.id))
    .limit(1);
  const canonicalCourseId = courseMatches[0]?.id ?? null;
  const courseIds = [...new Set([courseId, canonicalCourseId].filter((value): value is string => Boolean(value)))];
  const queryRows = async (ids?: string[]) => db
    .select({ idea: ide, provenance: asalIde, chunk: potonganSumber, source: sumberMateri })
    .from(ide)
    .innerJoin(asalIde, eq(asalIde.ideId, ide.id))
    .innerJoin(potonganSumber, eq(potonganSumber.id, asalIde.sourceChunkId))
    .innerJoin(sumberMateri, eq(sumberMateri.id, potonganSumber.sumberMateriId))
    .where(and(ids ? inArray(ide.mataKuliahId, ids) : undefined, eq(ide.status, "published"), eq(sumberMateri.status, "active")))
    .orderBy(asc(ide.code), asc(ide.id), asc(asalIde.id))
    .limit(120);
  const rows = await queryRows(courseIds);
  if (rows.length > 0) return { canonicalCourseId, rows, fallback: false };
  const fallbackRows = await queryRows();
  return { canonicalCourseId: fallbackRows[0]?.idea.mataKuliahId ?? canonicalCourseId, rows: fallbackRows, fallback: fallbackRows.length > 0 };
}

function buildCanonicalProduct(courseId: string, rows: CanonicalRow[]): Extract<ProductEntity, { productType: "article" }> {
  const ideas = [...new Map(rows.map((row) => [row.idea.id, row.idea])).values()].sort((left, right) => left.code.localeCompare(right.code) || left.id.localeCompare(right.id)).slice(0, 3);
  const selectedIds = new Set(ideas.map((idea) => idea.id));
  const refsByIdea = new Map<string, ArticleBlock["sourceRefs"]>();
  for (const row of rows) {
    if (!selectedIds.has(row.idea.id)) continue;
    const refs = refsByIdea.get(row.idea.id) ?? [];
    if (!refs.some((ref) => ref.sourceId === row.source.id && ref.version === row.source.version)) refs.push({ sourceId: row.source.id, version: row.source.version, checksum: row.source.checksum, excerptIds: [row.chunk.id] });
    else refs.find((ref) => ref.sourceId === row.source.id && ref.version === row.source.version)!.excerptIds.push(row.chunk.id);
    refsByIdea.set(row.idea.id, refs);
  }
  if (ideas.length === 0 || ideas.some((idea) => !refsByIdea.get(idea.id)?.length)) throw new Error("CANONICAL_SOURCE_TRACE_MISSING");
  const ideaIds = ideas.map((idea) => idea.id);
  const sourceRefs = [...new Map(ideas.flatMap((idea) => refsByIdea.get(idea.id) ?? []).map((ref) => [`${ref.sourceId}:${ref.version}`, { ...ref, excerptIds: [...new Set(ref.excerptIds)].sort() }])).values()].sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  const contentByIdea = new Map(ideas.map((idea) => [idea.id, idea.canonicalStatement.trim()]));
  const explanationByIdea = new Map(ideas.map((idea) => [idea.id, idea.conciseExplanation.trim()]));
  const generationHash = sha256({ ideas: ideas.map((idea) => ({ id: idea.id, version: idea.version, semanticHash: idea.semanticHash, generationHash: idea.generationHash })), sourceRefs });
  const sourceHash = sha256(sourceRefs);
  const blocks: Extract<ProductEntity, { productType: "article" }>['blocks'] = [];
  const metadata: Record<string, Partial<ArticleBlock>> = {};
  let orderIndex = 0;
  const add = (blockType: string, content: string, coveredIdeaIds: string[], traceRefs: ArticleBlock["sourceRefs"], learningPurpose: string, applicability: ArticleBlock["applicability"] = { status: "applicable" }) => {
    const id = `canonical-${String(orderIndex + 1).padStart(2, "0")}`;
    blocks.push({ id, blockType, orderIndex, content });
    metadata[id] = { ideaIds: coveredIdeaIds, sourceRefs: traceRefs, learningPurpose, generationHash, applicability };
    orderIndex += 1;
  };
  add("prior_knowledge_activation", ideas.map((idea) => contentByIdea.get(idea.id)).join("\n"), ideaIds, sourceRefs, "Activate published canonical Idea statements.");
  add("problem_introduction", ideas.map((idea) => contentByIdea.get(idea.id)).join("\n"), ideaIds, sourceRefs, "Introduce the canonical problem space without adding claims.");
  for (const idea of ideas) {
    const refs = refsByIdea.get(idea.id)!;
    const statement = contentByIdea.get(idea.id)!;
    add("explanation", statement, [idea.id], refs, "Explain the published canonical statement.");
    add("verbal_representation", explanationByIdea.get(idea.id) || statement, [idea.id], refs, "Represent the published Idea in concise language.");
    if (idea.latex?.trim()) add("mathematical_representation", `$$${idea.latex.trim()}$$`, [idea.id], refs, "Preserve the published Idea formula.");
    else add("mathematical_representation", "No canonical mathematical representation is present for this Idea.", [idea.id], refs, "Record typed inapplicability from the canonical Idea record.", { status: "inapplicable", reason: "not_mathematical" });
    add("analogy", statement, [idea.id], refs, "Retain only the canonical statement; no external analogy is introduced.");
    add("worked_example", statement, [idea.id], refs, "Retain only the canonical statement; no external example is introduced.");
    add("misconception", statement, [idea.id], refs, "Retain only the canonical statement; no external misconception is introduced.");
    add("application", statement, [idea.id], refs, "Retain only the canonical statement; no external application claim is introduced.");
    add("retrieval_prompt", statement, [idea.id], refs, "Use the canonical statement as the retrieval target.");
  }
  if (ideas.length > 1) add("cross_idea_synthesis", ideas.map((idea) => contentByIdea.get(idea.id)).join("\n"), ideaIds, sourceRefs, "Place published Idea statements in deterministic sequence.");
  add("summary", ideas.map((idea) => contentByIdea.get(idea.id)).join("\n"), ideaIds, sourceRefs, "Summarize only published Idea statements.");
  add("retrieval_close", ideas.map((idea) => contentByIdea.get(idea.id)).join("\n"), ideaIds, sourceRefs, "Close with the published Idea retrieval targets.");
  return {
    id: `preview:article:${courseId}:v1`,
    productType: "article",
    courseId,
    chapterId: ideas[0].babId,
    version: 1,
    status: "published",
    ideaLinks: ideas.map((idea, index) => ({ id: idea.id, version: idea.version, semanticHash: idea.semanticHash, weight: 1 / ideas.length, role: index === 0 ? "primary" : "supporting" })),
    sourceRefs,
    schemaVersion: "article.v1",
    sourceHash,
    generationHash,
    creatorId: ideas[0].creatorId,
    slug: `preview-${courseId}`,
    title: `Canonical preview for ${courseId}`,
    blocks,
    sections: [],
  };
}

async function loadProductFile(path: string): Promise<Extract<ProductEntity, { productType: "article" }>[]> {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  const products = Array.isArray(parsed) ? parsed : (parsed as { products?: unknown }).products;
  if (!Array.isArray(products)) throw new Error("PRODUCT_FIXTURE_INVALID");
  return products.filter((product): product is Extract<ProductEntity, { productType: "article" }> => Boolean(product && typeof product === "object" && (product as { productType?: unknown }).productType === "article"));
}

async function writeReport(report: Plan009QualityReport): Promise<string> {
  const path = plan009ArtifactPath(report.runId);
  await mkdir(join(process.cwd(), "artifacts", "staging-overhaul", report.runId), { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return path;
}

async function main(): Promise<void> {
  const runId = argument("--run-id");
  const courseId = argument("--course");
  const productFile = argument("--product-file");
  const dryRun = process.argv.includes("--dry-run");
  if (!runId || !courseId || !dryRun) throw new Error("PRODUCT_PREVIEW_ARGUMENTS_INVALID");
  assertStagingEnvironment({ productionEnv: parseEnvFile(join(process.cwd(), ".env.prod")), requiredResources: ["database", "authUrl"] });

  let report: Plan009QualityReport;
  try {
    let products: Extract<ProductEntity, { productType: "article" }>[];
    let fixtureMode: Plan009QualityReport["fixtureMode"];
    let canonicalCourseId: string | null = null;
    if (productFile) {
      products = await loadProductFile(productFile);
      fixtureMode = "product_bundle";
    } else {
      const canonical = await loadCanonicalRows(courseId);
      canonicalCourseId = canonical.canonicalCourseId;
      products = canonical.rows.length > 0 ? [buildCanonicalProduct(canonicalCourseId ?? courseId, canonical.rows)] : [];
      fixtureMode = products.length > 0 ? (canonical.fallback ? "canonical_idea_source_fallback" : "canonical_idea_source") : "none";
    }
    const selected = products.filter((product) => product.courseId === (fixtureMode === "canonical_idea_source" || fixtureMode === "canonical_idea_source_fallback" ? product.courseId : courseId));
    if (selected.length === 0) {
      report = emptyReport(runId, courseId, [fixtureMode === "none" ? "CANONICAL_FIXTURE_NOT_FOUND" : "PRODUCT_FIXTURE_NOT_FOUND"], canonicalCourseId);
    } else {
      const product = selected.sort((left, right) => left.id.localeCompare(right.id) || left.version - right.version)[0];
      const first = compileArticleProduct(product, { strict: false });
      const second = compileArticleProduct(product, { strict: false });
      const diktat = first.article.reviewerState === "approved" && first.quality.passed ? compileDiktatFromApprovedArticle(first.article) : null;
      const failureCodes = [...(first.quality.passed ? [] : first.quality.issues.map((issue) => issue.code)), ...(diktat?.quality.passed ? [] : diktat?.quality.issues.map((issue) => issue.code) ?? ["DIKTAT_QUALITY_NOT_AVAILABLE"] )];
      report = {
        schemaVersion: PLAN009_REPORT_SCHEMA,
        plan: "009",
        runId,
        courseId,
        canonicalCourseId,
        status: "passed",
        fixtureMode,
        productCount: selected.length,
        article: { document: first.article, markdown: first.markdown, astHash: sha256(first.ast), quality: first.quality },
        diktat: { document: diktat?.document ?? null, compression: diktat?.report ?? null, quality: diktat?.quality ?? { passed: false, score: 0, issues: [{ code: "DIKTAT_QUALITY_NOT_AVAILABLE", message: "Diktat could not be compiled from a passing article." }], metrics: { ideaCoveragePercent: 0, compressionLossFreePercent: 0 } } },
        deterministic: { hashesMatch: first.generationHash === second.generationHash, markdownMatch: first.markdown === second.markdown, astMatch: JSON.stringify(first.ast) === JSON.stringify(second.ast) },
        readOnly: { mutationStatus: "read_only", writesAttempted: 0, rowsChanged: 0 },
        failureCodes,
      };
      const reportFailures = validatePlan009Report(report);
      report.failureCodes = [...new Set([...report.failureCodes, ...reportFailures])].sort();
      report.status = report.failureCodes.length === 0 ? "passed" : "blocked";
    }
  } catch (error) {
    report = emptyReport(runId, courseId, [error instanceof Error ? error.message.split(":")[0] : "PRODUCT_PREVIEW_FAILED"]);
  }
  const artifactPath = await writeReport(report);
  console.log(JSON.stringify({ status: report.status, runId, courseId, fixtureMode: report.fixtureMode, productCount: report.productCount, artifactPath, failureCodes: report.failureCodes }, null, 2));
  if (report.status !== "passed") process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ status: "blocked", code: "PRODUCT_PREVIEW_FAILED", message: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});
