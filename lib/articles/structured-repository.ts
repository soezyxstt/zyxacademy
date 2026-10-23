import { hydrateSourceFiguresForReader } from "./source-figure-resolver";
import { articlePartsSchema } from "@/lib/materials/article-parts";
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
  fileKey?: string | null;
  productType: "article" | "diktat";
  chapterId: string | null;
  babId?: string | null;
}

/**
 * Resolves a canonical course record from either mataKuliah.id or mataKuliah.legacyCourseId.
 * Web consumers may memoize this framework-neutral resolver per request.
 */
export async function findCanonicalMataKuliah(courseId: string) {
  if (!courseId || typeof courseId !== "string" || !courseId.trim()) return undefined;
  try {
    const trimmedId = courseId.trim();
    const [matched] = await db
      .select()
      .from(mataKuliah)
      .where(or(eq(mataKuliah.id, trimmedId), eq(mataKuliah.legacyCourseId, trimmedId)))
      .limit(1);
    return matched;
  } catch (error) {
    console.error("Error finding canonical mataKuliah:", error);
    return undefined;
  }
}

export interface SharedCanonicalArticle {
  articleRecord: typeof artikel.$inferSelect;
  chapterRecord: typeof bab.$inferSelect | null;
  resolvedChapterId: string | null;
  matchedCourse: typeof mataKuliah.$inferSelect | undefined;
  parsedSections: Array<
    typeof bagianArtikel.$inferSelect & {
      pedagogy?: unknown;
    }
  >;
  parsedBlocks: Array<
    typeof blokArtikel.$inferSelect & {
      workedExamplePayload?: unknown;
      formativeCheckPayload?: unknown;
      visualIds?: unknown;
      parts?: unknown;
    }
  >;
  articleVisuals: unknown[];
}

/**
 * Shared non-personalized article data fetcher.
 * Web consumers memoize this reader separately from user progress.
 */
export async function fetchSharedCanonicalArticle(
  courseId: string,
  articleIdOrSlug: string,
): Promise<SharedCanonicalArticle | null> {
    try {
      const decodedArticleIdOrSlug = decodeURIComponent(articleIdOrSlug);
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
            or(eq(artikel.id, decodedArticleIdOrSlug), eq(artikel.slug, decodedArticleIdOrSlug)),
          ),
        )
        .limit(1);

      if (!articleRecord) {
        return null;
      }

      if (articleRecord.structureStatus !== "structured") return null;

      // Fetch chapter, published sections, and published blocks concurrently after article resolution
      const chapterPromise = articleRecord.babId
        ? db
            .select()
            .from(bab)
            .where(eq(bab.id, articleRecord.babId))
            .limit(1)
        : Promise.resolve([] as Array<typeof bab.$inferSelect>);

      const sectionsPromise = db
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

      const blocksPromise = db
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

      const [matchedChapters, sections, blocks] = await Promise.all([
        chapterPromise,
        sectionsPromise,
        blocksPromise,
      ]);

      let chapterRecord: typeof bab.$inferSelect | null = null;
      let resolvedChapterId: string | null = articleRecord.babId ?? null;
      if (articleRecord.babId) {
        const matchedChapter = matchedChapters[0];
        chapterRecord = matchedChapter ?? null;
        if (matchedChapter?.legacyChapterId) {
          resolvedChapterId = matchedChapter.legacyChapterId;
        }
      }

      if (sections.length === 0) return null;

      // Extract visuals from article contentMarkdown if present
      let articleVisuals: unknown[] = [];
      const visualMatch = articleRecord.contentMarkdown.match(
        /<!--__ZYX_V3_ARTICLE_VISUALS__:([A-Za-z0-9_-]+)-->/,
      );
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
        const pedMatch = s.learningObjective?.match(
          /<!--__ZYX_V3_SECTION_PEDAGOGY__:([A-Za-z0-9_-]+)-->/,
        );
        if (pedMatch) {
          try {
            pedagogy = JSON.parse(Buffer.from(pedMatch[1], "base64url").toString("utf8"));
            cleanObjective = s.learningObjective
              .replace(/<!--__ZYX_V3_SECTION_PEDAGOGY__:[A-Za-z0-9_-]+-->/, "")
              .trim();
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
        let visualIds: unknown = undefined;
        let parts: unknown = undefined;
        const isV4 = b.content.includes("<!--__ZYX_V4_BLOCK_PAYLOAD__:");
        let cleanContent = b.content;
        const payloadMatch = b.content?.match(
          /<!--__ZYX_V[34]_BLOCK_PAYLOAD__:([A-Za-z0-9_-]+)-->/,
        );
        if (payloadMatch) {
          try {
            const parsed = JSON.parse(Buffer.from(payloadMatch[1], "base64url").toString("utf8"));
            workedExamplePayload = parsed.workedExamplePayload;
            formativeCheckPayload = parsed.formativeCheckPayload;
            visualIds = parsed.visualIds;
            parts = isV4 ? articlePartsSchema.parse(parsed.parts) : parsed.parts;
            cleanContent = b.content
              .replace(/<!--__ZYX_V[34]_BLOCK_PAYLOAD__:[A-Za-z0-9_-]+-->/, "")
              .trim();
          } catch {
            if (isV4) throw new Error("ARTICLE_V4_PAYLOAD_INVALID");
            // Fallback to undefined payloads
          }
        }
        if (isV4 && !payloadMatch) throw new Error("ARTICLE_V4_PAYLOAD_INVALID");
        return {
          ...b,
          content: cleanContent,
          workedExamplePayload,
          formativeCheckPayload,
          visualIds,
          parts,
        };
      });

      return {
        articleRecord,
        chapterRecord,
        resolvedChapterId,
        matchedCourse,
        parsedSections,
        parsedBlocks,
        articleVisuals,
      };
    } catch (error) {
      console.error("Error fetching shared canonical article:", error);
      return null;
    }
  }

/**
 * Fetches a single published canonical article with all its sections, blocks,
 * and user reading progress, returning a strictly sanitized public read model.
 * Deduplicates non-personalized article data across requests/metadata while preserving user progress isolation.
 */
export async function getCanonicalPublishedArticle(
  courseId: string,
  articleIdOrSlug: string,
  userId?: string,
  fetchShared: (courseId: string, articleIdOrSlug: string) => Promise<SharedCanonicalArticle | null> = fetchSharedCanonicalArticle,
): Promise<PublicArticleReadModel | null> {
  try {
    const normalizedCourseId = courseId?.trim() ?? "";
    const normalizedArticleIdOrSlug = articleIdOrSlug?.trim() ?? "";
    if (!normalizedCourseId || !normalizedArticleIdOrSlug) return null;

    const shared = await fetchShared(normalizedCourseId, normalizedArticleIdOrSlug);
    if (!shared) return null;

    const {
      articleRecord,
      chapterRecord,
      resolvedChapterId,
      matchedCourse,
      parsedSections,
      parsedBlocks,
      articleVisuals,
    } = shared;

    // Fetch user progress if userId provided
    let progressRecords: any = null;
    const normalizedUserId = userId?.trim();
    if (normalizedUserId) {
      progressRecords = await db
        .select()
        .from(kemajuanBacaArtikel)
        .where(
          and(
            eq(kemajuanBacaArtikel.penggunaId, normalizedUserId),
            eq(kemajuanBacaArtikel.artikelId, articleRecord.id),
            eq(kemajuanBacaArtikel.artikelVersion, articleRecord.version),
          ),
        );
    }

    const publicArticle = buildPublicArticleReadModel(
      {
        id: articleRecord.id,
        courseId: normalizedCourseId,
        babId: articleRecord.babId,
        slug: articleRecord.slug,
        title: articleRecord.title,
        version: articleRecord.version,
        status: articleRecord.status,
        visuals: articleVisuals,
        updatedAt: articleRecord.updatedAt,
      },
      parsedSections,
      parsedBlocks,
      progressRecords,
      {
        id: resolvedChapterId,
        title: chapterRecord?.title ?? null,
        number: chapterRecord ? chapterRecord.orderIndex : null,
        courseTitle: matchedCourse?.title ?? null,
      },
    );
    return await hydrateSourceFiguresForReader(publicArticle, articleVisuals, {
      courseId: normalizedCourseId,
      legacyCourseId: matchedCourse?.legacyCourseId ?? null,
      userId,
    });
  } catch (error) {
    console.error("Error fetching canonical published article:", error);
    return null;
  }
}

/**
 * Framework-neutral canonical text product lookup.
 */
export async function getCanonicalPublishedTextProduct(
  courseId: string,
  productId: string,
): Promise<CanonicalTextProduct | null> {
    try {
      const normalizedCourseId = courseId?.trim() ?? "";
      const normalizedProductId = productId ? decodeURIComponent(productId).trim() : "";
      if (!normalizedCourseId || !normalizedProductId) return null;

      const matchedCourse = await findCanonicalMataKuliah(normalizedCourseId);
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
            or(eq(artikel.id, normalizedProductId), eq(artikel.slug, normalizedProductId)),
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
          babId: articleRecord.babId ?? null,
        };
      }

      const [diktatRecord] = await db
        .select({
          id: diktatMateri.id,
          title: diktatMateri.title,
          contentMarkdown: diktatMateri.contentMarkdown,
          fileKey: diktatMateri.fileKey,
          babId: diktatMateri.babId,
          legacyChapterId: bab.legacyChapterId,
        })
        .from(diktatMateri)
        .leftJoin(bab, eq(diktatMateri.babId, bab.id))
        .where(
          and(
            eq(diktatMateri.mataKuliahId, matchedCourse.id),
            eq(diktatMateri.status, "published"),
            eq(diktatMateri.id, normalizedProductId),
          ),
        )
        .limit(1);
      return diktatRecord
        ? {
            id: diktatRecord.id,
            title: diktatRecord.title,
            contentMarkdown: diktatRecord.contentMarkdown,
            fileKey: diktatRecord.fileKey ?? null,
            productType: "diktat",
            chapterId: diktatRecord.legacyChapterId ?? diktatRecord.babId,
            babId: diktatRecord.babId ?? null,
          }
        : null;
    } catch (error) {
      console.error("Error fetching canonical text product:", error);
      return null;
    }
  }

export interface SharedCourseArticlesData {
  articles: Array<typeof artikel.$inferSelect>;
  babMap: Map<string, typeof bab.$inferSelect>;
  sectionsByArticle: Map<string, Array<typeof bagianArtikel.$inferSelect>>;
}

/**
 * Shared non-personalized articles data for course.
 * Web consumers may memoize this framework-neutral reader per request.
 */
export async function fetchSharedCourseArticlesData(
  courseId: string,
): Promise<SharedCourseArticlesData | null> {
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
        return null;
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

      const sectionsByArticle = new Map<string, typeof sections>();
      for (const s of sections) {
        const list = sectionsByArticle.get(s.artikelId) ?? [];
        list.push(s);
        sectionsByArticle.set(s.artikelId, list);
      }

      return { articles, babMap, sectionsByArticle };
    } catch (error) {
      console.error("Error fetching shared course articles data:", error);
      return null;
    }
  }

/**
 * Fetches all canonical published articles for a course, with progress and chapter mapping.
 * Deduplicates non-personalized course queries per request while keeping user progress separate.
 */
export async function getCanonicalPublishedArticlesForCourse(
  courseId: string,
  userId?: string,
  fetchShared: (courseId: string) => Promise<SharedCourseArticlesData | null> = fetchSharedCourseArticlesData,
): Promise<CanonicalArticleSummary[]> {
  try {
    const normalizedCourseId = courseId?.trim() ?? "";
    if (!normalizedCourseId) return [];

    const shared = await fetchShared(normalizedCourseId);
    if (!shared) return [];

    const { articles, babMap, sectionsByArticle } = shared;
    const articleIds = articles.map((a) => a.id);

    // Fetch user progress for all these articles if authenticated
    const normalizedUserId = userId?.trim();
    const progressRecords =
      normalizedUserId && articleIds.length > 0
        ? await db
            .select()
            .from(kemajuanBacaArtikel)
            .where(
              and(
                eq(kemajuanBacaArtikel.penggunaId, normalizedUserId),
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

    return articles.map((a) => {
      const babItem = a.babId ? babMap.get(a.babId) : null;
      const legacyChapterId = babItem?.legacyChapterId ?? null;
      const chapterId = legacyChapterId ?? a.babId ?? null;

      const artSections = (sectionsByArticle.get(a.id) ?? []).filter(
        (section) => section.version === a.version,
      );
      const totalEstimatedReadingMinutes = artSections.reduce(
        (acc, s) => acc + (s.estimatedReadingMinutes || 3),
        0,
      );

      const userProg = (progressByArticle.get(a.id) ?? []).filter(
        (progress) => progress.artikelVersion === a.version,
      );
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
        courseId: normalizedCourseId,
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
