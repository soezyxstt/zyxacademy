import { createHash } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { artikel, bagianArtikel, blokArtikel, reviewItemBundle } from "@/db/schema";
import { planLegacyArticleConversion } from "@/lib/articles/legacy-structure";

function stableId(prefix: string, value: string): string {
  return `${prefix}-${createHash("sha256").update(`${prefix}:${value}`, "utf8").digest("hex").slice(0, 32)}`;
}

const apply = process.argv.includes("--apply");
if (apply && process.env.ALLOW_STRUCTURED_ARTICLE_RECONCILE !== "1") {
  throw new Error("STRUCTURED_ARTICLE_RECONCILE_CONFIRMATION_REQUIRED");
}
if (apply && process.env.NODE_ENV === "production") {
  throw new Error("STRUCTURED_ARTICLE_RECONCILE_PRODUCTION_FORBIDDEN");
}

const articles = await db.select().from(artikel);
const existingSections = await db.select({ artikelId: bagianArtikel.artikelId }).from(bagianArtikel);
const structuredArticleIds = new Set(existingSections.map((section) => section.artikelId));
const plans = articles.map((article) => ({
  article,
  plan: structuredArticleIds.has(article.id)
    ? { classification: "deterministic_convertible" as const, reason: "sections_already_exist", sections: [] }
    : planLegacyArticleConversion(article.contentMarkdown),
}));

const report = {
  mode: apply ? "apply" : "dry-run",
  articleCount: articles.length,
  alreadyStructured: plans.filter((item) => item.plan.reason === "sections_already_exist").length,
  deterministicConvertible: plans.filter((item) => item.plan.reason === "trusted_heading_outline").length,
  needsReauthoring: plans.filter((item) => item.plan.classification === "needs_reauthoring").length,
  legacyReviewTargets: Number((await db.select({ count: sql<number>`count(*)` }).from(reviewItemBundle).where(and(eq(reviewItemBundle.targetType, "article_block"), isNull(reviewItemBundle.targetId))))[0]?.count ?? 0),
};

if (apply) {
  await db.transaction(async (tx) => {
    await tx.update(reviewItemBundle).set({ targetId: sql`${reviewItemBundle.blockId}` }).where(and(eq(reviewItemBundle.targetType, "article_block"), isNull(reviewItemBundle.targetId)));
    for (const { article, plan } of plans) {
      if (plan.reason === "sections_already_exist") {
        await tx.update(artikel).set({ structureStatus: "structured" }).where(eq(artikel.id, article.id));
        continue;
      }
      if (plan.classification === "needs_reauthoring") {
        await tx.update(artikel).set({ structureStatus: "needs_reauthoring" }).where(eq(artikel.id, article.id));
        continue;
      }
      for (const section of plan.sections) {
        const sectionId = stableId("artikel-section-legacy", `${article.id}:${article.version}:${section.slug}`);
        const wordCount = section.contentMarkdown.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
        await tx.insert(bagianArtikel).values({
          id: sectionId,
          artikelId: article.id,
          bagianPembelajaranId: null,
          parentSectionId: null,
          sectionKey: `legacy:${section.slug}`,
          sectionKind: section.kind,
          slug: section.slug,
          title: section.title,
          learningObjective: section.kind === "overview" ? "Memahami peta belajar chapter ini." : `Memahami ${section.title}.`,
          orderIndex: section.orderIndex,
          estimatedReadingMinutes: Math.max(1, Math.ceil(wordCount / 200)),
          version: article.version,
          status: "published",
        }).onConflictDoNothing();
        await tx.insert(blokArtikel).values({
          id: stableId("artikel-block-legacy", `${sectionId}:content`),
          artikelId: article.id,
          bagianArtikelId: sectionId,
          blockKey: `legacy:${section.slug}:content`,
          blockType: section.kind === "summary" ? "summary" : section.kind === "overview" ? "prior_knowledge_activation" : "explanation",
          title: null,
          orderIndex: 0,
          content: section.contentMarkdown,
          version: article.version,
          generationHash: article.generationHash,
          status: "published",
        }).onConflictDoNothing();
      }
      await tx.update(artikel).set({ structureStatus: "structured" }).where(eq(artikel.id, article.id));
    }
  });
}

console.log(JSON.stringify(report, null, 2));
