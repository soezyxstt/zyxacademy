import { db } from "@/db";
import {
  artikel,
  bagianArtikel,
  blokArtikel,
  kemajuanBacaArtikel,
  mataKuliah,
  bab,
  diktatMateri,
} from "@/db/schema";
import { eq, and, or, inArray, asc } from "drizzle-orm";
import {
  buildPublicArticleReadModel,
  type PublicArticleReadModel,
} from "./structured-read-model";

export interface CanonicalArticleSummary {
  id: string;
  slug: string;
  title: string;
  courseId: string;
  babId: string | null;
  chapterId: string | null;
  legacyChapterId: string | null;
  totalEstimatedReadingMinutes: number;
  sectionsCount: number;
  completed: boolean;
  completionPercent: number;
  publishedAt?: Date | null;
  updatedAt: Date;
}

export interface CanonicalTextProduct {
  id: string;
  title: string;
  contentMarkdown: string;
  productType: "article" | "diktat";
  chapterId: string | null;
}

/**
 * Resolves a canonical course record from either mataKuliah.id or mataKuliah.legacyCourseId.
 */
export async function findCanonicalMataKuliah(courseId: string) {
  try {
    const [matched] = await db
      .select()
      .from(mataKuliah)
      .where(or(eq(mataKuliah.id, courseId), eq(mataKuliah.legacyCourseId, courseId)))
      .limit(1);
    return matched;
  } catch (error) {
    console.error("Error finding canonical mataKuliah:", error);
    return undefined;
  }
}

/**
 * Fetches a single published canonical article with all its sections, blocks,
 * and user reading progress, returning a strictly sanitized public read model.
 */
export async function getCanonicalPublishedArticle(
  courseId: string,
  articleIdOrSlug: string,
  userId?: string,
): Promise<PublicArticleReadModel | null> {
  try {
    const matchedCourse = await findCanonicalMataKuliah(courseId);
    const validCourseIds = matchedCourse
      ? [matchedCourse.id, ...(matchedCourse.legacyCourseId ? [matchedCourse.legacyCourseId] : [])]
      : [courseId];

    // Find the published article matching either ID or slug within the verified course
    const [articleRecord] = await db
      .select()
      .from(artikel)
      .where(
        and(
          inArray(artikel.mataKuliahId, validCourseIds),
          eq(artikel.status, "published"),
          or(eq(artikel.id, articleIdOrSlug), eq(artikel.slug, articleIdOrSlug)),
        ),
      )
      .limit(1);

    if (!articleRecord) {
      return null;
    }

    if (articleRecord.structureStatus !== "structured") return null;

    // Resolve chapter ID if babId is present
    let chapterRecord: typeof bab.$inferSelect | null = null;
    let resolvedChapterId: string | null = articleRecord.babId ?? null;
    if (articleRecord.babId) {
      const [matchedChapter] = await db
        .select()
        .from(bab)
        .where(eq(bab.id, articleRecord.babId))
        .limit(1);
      chapterRecord = matchedChapter ?? null;
      if (matchedChapter?.legacyChapterId) {
        resolvedChapterId = matchedChapter.legacyChapterId;
      }
    }

    // Fetch published sections for this article version
    const sections = await db
      .select()
      .from(bagianArtikel)
      .where(
        and(
          eq(bagianArtikel.artikelId, articleRecord.id),
          eq(bagianArtikel.version, articleRecord.version),
          eq(bagianArtikel.status, "published"),
        ),
      )
      .orderBy(asc(bagianArtikel.orderIndex));

    if (sections.length === 0) return null;

    // Fetch published blocks for this article version
    const blocks = await db
      .select()
      .from(blokArtikel)
      .where(
        and(
          eq(blokArtikel.artikelId, articleRecord.id),
          eq(blokArtikel.version, articleRecord.version),
          eq(blokArtikel.status, "published"),
        ),
      )
      .orderBy(asc(blokArtikel.orderIndex));

    // Fetch user progress if userId provided
    let progressRecords: any = null;
    if (userId) {
      progressRecords = await db
        .select()
        .from(kemajuanBacaArtikel)
        .where(
          and(
            eq(kemajuanBacaArtikel.penggunaId, userId),
            eq(kemajuanBacaArtikel.artikelId, articleRecord.id),
            eq(kemajuanBacaArtikel.artikelVersion, articleRecord.version),
          ),
        );
    }

    // Extract visuals from article contentMarkdown if present
    let articleVisuals: unknown[] = [];
    const visualMatch = articleRecord.contentMarkdown.match(/<!--__ZYX_V3_ARTICLE_VISUALS__:([A-Za-z0-9_-]+)-->/);
    if (visualMatch) {
      try {
        articleVisuals = JSON.parse(Buffer.from(visualMatch[1], "base64url").toString("utf8"));
      } catch {
        // Fallback to empty array if parsing fails
      }
    }

    // Process sections to extract pedagogy metadata
    const parsedSections = sections.map((s) => {
      let pedagogy: unknown = undefined;
      let cleanObjective = s.learningObjective;
      const pedMatch = s.learningObjective.match(/<!--__ZYX_V3_SECTION_PEDAGOGY__:([A-Za-z0-9_-]+)-->/);
      if (pedMatch) {
        try {
          pedagogy = JSON.parse(Buffer.from(pedMatch[1], "base64url").toString("utf8"));
          cleanObjective = s.learningObjective.replace(/<!--__ZYX_V3_SECTION_PEDAGOGY__:[A-Za-z0-9_-]+-->/, "").trim();
        } catch {
          // Fallback to undefined pedagogy
        }
      }
      return {
        ...s,
        learningObjective: cleanObjective,
        pedagogy,
      };
    });

    // Process blocks to extract workedExamplePayload and formativeCheckPayload
    const parsedBlocks = blocks.map((b) => {
      let workedExamplePayload: unknown = undefined;
      let formativeCheckPayload: unknown = undefined;
      let cleanContent = b.content;
      const payloadMatch = b.content.match(/<!--__ZYX_V3_BLOCK_PAYLOAD__:([A-Za-z0-9_-]+)-->/);
      if (payloadMatch) {
        try {
          const parsed = JSON.parse(Buffer.from(payloadMatch[1], "base64url").toString("utf8"));
          workedExamplePayload = parsed.workedExamplePayload;
          formativeCheckPayload = parsed.formativeCheckPayload;
          cleanContent = b.content.replace(/<!--__ZYX_V3_BLOCK_PAYLOAD__:[A-Za-z0-9_-]+-->/, "").trim();
        } catch {
          // Fallback to undefined payloads
        }
      }
      return {
        ...b,
        content: cleanContent,
        workedExamplePayload,
        formativeCheckPayload,
      };
    });

    return buildPublicArticleReadModel(
      {
        id: articleRecord.id,
        courseId,
        babId: articleRecord.babId,
        slug: articleRecord.slug,
        title: articleRecord.title,
        version: articleRecord.version,
        status: articleRecord.status,
        visuals: articleVisuals,
      },
      parsedSections,
      parsedBlocks,
      progressRecords,
      {
        id: resolvedChapterId,
        title: chapterRecord?.title ?? null,
        number: chapterRecord ? chapterRecord.orderIndex + 1 : null,
        courseTitle: matchedCourse?.title ?? null,
      },
    );
  } catch (error) {
    console.error("Error fetching canonical published article:", error);
    return null;
  }
}

export async function getCanonicalPublishedTextProduct(
  courseId: string,
  productId: string,
): Promise<CanonicalTextProduct | null> {
  try {
    const matchedCourse = await findCanonicalMataKuliah(courseId);
    if (!matchedCourse) return null;

    const [articleRecord] = await db
      .select({
        id: artikel.id,
        title: artikel.title,
        contentMarkdown: artikel.contentMarkdown,
        structureStatus: artikel.structureStatus,
        babId: artikel.babId,
        legacyChapterId: bab.legacyChapterId,
      })
      .from(artikel)
      .leftJoin(bab, eq(artikel.babId, bab.id))
      .where(
        and(
          eq(artikel.mataKuliahId, matchedCourse.id),
          eq(artikel.status, "published"),
          or(eq(artikel.id, productId), eq(artikel.slug, productId)),
        ),
      )
      .limit(1);
    if (articleRecord && articleRecord.structureStatus !== "structured") {
      return {
        id: articleRecord.id,
        title: articleRecord.title,
        contentMarkdown: articleRecord.contentMarkdown,
        productType: "article",
        chapterId: articleRecord.legacyChapterId ?? articleRecord.babId,
      };
    }

    const [diktatRecord] = await db
      .select({
        id: diktatMateri.id,
        title: diktatMateri.title,
        contentMarkdown: diktatMateri.contentMarkdown,
        babId: diktatMateri.babId,
        legacyChapterId: bab.legacyChapterId,
      })
      .from(diktatMateri)
      .leftJoin(bab, eq(diktatMateri.babId, bab.id))
      .where(
        and(
          eq(diktatMateri.mataKuliahId, matchedCourse.id),
          eq(diktatMateri.status, "published"),
          eq(diktatMateri.id, productId),
        ),
      )
      .limit(1);
    return diktatRecord
      ? {
          id: diktatRecord.id,
          title: diktatRecord.title,
          contentMarkdown: diktatRecord.contentMarkdown,
          productType: "diktat",
          chapterId: diktatRecord.legacyChapterId ?? diktatRecord.babId,
        }
      : null;
  } catch (error) {
    console.error("Error fetching canonical text product:", error);
    return null;
  }
}

/**
 * Fetches all canonical published articles for a course, with progress and chapter mapping.
 */
export async function getCanonicalPublishedArticlesForCourse(
  courseId: string,
  userId?: string,
): Promise<CanonicalArticleSummary[]> {
  try {
    const matchedCourse = await findCanonicalMataKuliah(courseId);
    const validCourseIds = matchedCourse
      ? [matchedCourse.id, ...(matchedCourse.legacyCourseId ? [matchedCourse.legacyCourseId] : [])]
      : [courseId];

    const articles = await db
      .select()
      .from(artikel)
      .where(
        and(
          inArray(artikel.mataKuliahId, validCourseIds),
          eq(artikel.status, "published"),
        ),
      );

    if (articles.length === 0) {
      return [];
    }

    const articleIds = articles.map((a) => a.id);
    const babIds = articles.map((a) => a.babId).filter(Boolean) as string[];

    // Fetch associated babs for legacy chapter mapping
    const babRecords =
      babIds.length > 0
        ? await db
            .select()
            .from(bab)
            .where(inArray(bab.id, babIds))
        : [];
    const babMap = new Map(babRecords.map((b) => [b.id, b]));

    // Fetch published sections for all these articles
    const sections = await db
      .select()
      .from(bagianArtikel)
      .where(
        and(
          inArray(bagianArtikel.artikelId, articleIds),
          eq(bagianArtikel.status, "published"),
        ),
      );

    // Fetch user progress for all these articles if authenticated
    const progressRecords =
      userId && articleIds.length > 0
        ? await db
            .select()
            .from(kemajuanBacaArtikel)
            .where(
              and(
                eq(kemajuanBacaArtikel.penggunaId, userId),
                inArray(kemajuanBacaArtikel.artikelId, articleIds),
              ),
            )
        : [];

    const progressByArticle = new Map<string, typeof progressRecords>();
    for (const p of progressRecords) {
      const list = progressByArticle.get(p.artikelId) ?? [];
      list.push(p);
      progressByArticle.set(p.artikelId, list);
    }

    const sectionsByArticle = new Map<string, typeof sections>();
    for (const s of sections) {
      const list = sectionsByArticle.get(s.artikelId) ?? [];
      list.push(s);
      sectionsByArticle.set(s.artikelId, list);
    }

    return articles.map((a) => {
      const babItem = a.babId ? babMap.get(a.babId) : null;
      const legacyChapterId = babItem?.legacyChapterId ?? null;
      const chapterId = legacyChapterId ?? a.babId ?? null;

      const artSections = (sectionsByArticle.get(a.id) ?? []).filter((section) => section.version === a.version);
      const totalEstimatedReadingMinutes = artSections.reduce(
        (acc, s) => acc + (s.estimatedReadingMinutes || 3),
        0,
      );

      const userProg = (progressByArticle.get(a.id) ?? []).filter((progress) => progress.artikelVersion === a.version);
      let completed = false;
      let completionPercent = 0;

      if (userProg.length > 0 && artSections.length > 0) {
        let completedSections = 0;
        let sumPercent = 0;
        for (const p of userProg) {
          if (p.maxReadPercent >= 90 || p.completedAt) {
            completedSections++;
          }
          sumPercent += p.maxReadPercent;
        }
        completionPercent = Math.min(100, Math.round(sumPercent / artSections.length));
        completed = completedSections >= artSections.length || completionPercent >= 90;
      }

      return {
        id: a.id,
        slug: a.slug,
        title: a.title,
        courseId,
        babId: a.babId,
        chapterId,
        legacyChapterId,
        totalEstimatedReadingMinutes: Math.max(1, totalEstimatedReadingMinutes),
        sectionsCount: artSections.length,
        completed,
        completionPercent,
        publishedAt: a.publishedAt,
        updatedAt: a.updatedAt,
      };
    });
  } catch (error) {
    console.error("Error getting canonical published articles for course:", error);
    return [];
  }
}
