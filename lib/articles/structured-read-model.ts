export interface PublicBlockReadModel {
  id: string;
  blockKey: string;
  blockType: string;
  title: string | null;
  orderIndex: number;
  content: string;
}

export interface PublicSectionReadModel {
  id: string;
  slug: string;
  title: string;
  sectionNumber: string;
  sectionKind: "overview" | "topic" | "summary";
  learningObjective: string;
  estimatedReadingMinutes: number;
  orderIndex: number;
  parentSectionId: string | null;
  blocks: PublicBlockReadModel[];
}

export interface SectionProgressDetail {
  maxReadPercent: number;
  completed: boolean;
  timeSpentSeconds: number;
  lastReadAt?: string | null;
}

export interface PublicArticleProgress {
  completed: boolean;
  overallPercent: number;
  lastSectionSlug: string | null;
  sectionProgress: Record<string, SectionProgressDetail>;
}

export interface PublicArticleReadModel {
  id: string;
  courseId: string;
  chapterId: string | null;
  slug: string;
  title: string;
  courseTitle: string;
  chapterTitle: string | null;
  chapterNumber: number | null;
  version: number;
  sections: PublicSectionReadModel[];
  totalEstimatedReadingMinutes: number;
  progress?: PublicArticleProgress | null;
}

export interface SearchMatchResult {
  sectionId: string;
  sectionSlug: string;
  sectionTitle: string;
  sectionNumber: string;
  snippet: string;
  matchType: "title" | "objective" | "block";
  blockTitle?: string | null;
}

/**
 * Deterministically computes section numbers (e.g., 1, 2, 3 or hierarchical 1.1, 1.2).
 */
export function computeDeterministicSectionNumbering<
  T extends { id: string; orderIndex: number; parentSectionId?: string | null; sectionKind?: "overview" | "topic" | "summary" | string },
>(sections: readonly T[], chapterNumber?: number): Map<string, string> {
  const numberMap = new Map<string, string>();
  if (!sections || sections.length === 0) return numberMap;

  // Separate root sections vs child sections
  const roots: T[] = [];
  const childrenByParent = new Map<string, T[]>();
  const sectionIds = new Set(sections.map((s) => s.id));

  for (const s of sections) {
    if (s.parentSectionId && sectionIds.has(s.parentSectionId)) {
      const existing = childrenByParent.get(s.parentSectionId) ?? [];
      existing.push(s);
      childrenByParent.set(s.parentSectionId, existing);
    } else {
      roots.push(s);
    }
  }

  // Sort roots by orderIndex then id
  roots.sort((a, b) => a.orderIndex - b.orderIndex || a.id.localeCompare(b.id));

  const numberedRoots = roots.filter((root) => !chapterNumber || !root.sectionKind || root.sectionKind === "topic");
  const visitChildren = (parent: T, parentNumber: string, depth: number): void => {
    if (depth >= (chapterNumber ? 2 : 3)) return;
    const children = [...(childrenByParent.get(parent.id) ?? [])].sort((a, b) => a.orderIndex - b.orderIndex || a.id.localeCompare(b.id));
    children.forEach((child, childIdx) => {
      const childNumber = `${parentNumber}.${childIdx + 1}`;
      numberMap.set(child.id, childNumber);
      visitChildren(child, childNumber, depth + 1);
    });
  };

  roots.forEach((root) => {
    if (chapterNumber && root.sectionKind === "overview") {
      numberMap.set(root.id, "Ikhtisar");
      return;
    }
    if (chapterNumber && root.sectionKind === "summary") {
      numberMap.set(root.id, "Ringkasan");
      return;
    }
    const rootIdx = numberedRoots.findIndex((candidate) => candidate.id === root.id);
    const rootNumber = chapterNumber ? `${chapterNumber}.${rootIdx + 1}` : String(rootIdx + 1);
    numberMap.set(root.id, rootNumber);
    visitChildren(root, rootNumber, 1);
  });

  // Safety fallback for any unvisited sections
  sections.forEach((s, idx) => {
    if (!numberMap.has(s.id)) {
      numberMap.set(s.id, String(idx + 1));
    }
  });

  return numberMap;
}

/**
 * Resolves the currently active section from URL slug or last read progress,
 * falling back to the first available section.
 */
export function resolveActiveSection(
  sections: readonly PublicSectionReadModel[],
  requestedSlug?: string | null,
  lastReadSlug?: string | null,
): PublicSectionReadModel | null {
  if (!sections || sections.length === 0) return null;

  if (requestedSlug) {
    const normalizedReq = requestedSlug.trim().toLowerCase();
    const found = sections.find((s) => s.slug.toLowerCase() === normalizedReq);
    if (found) return found;
  }

  if (lastReadSlug) {
    const normalizedLast = lastReadSlug.trim().toLowerCase();
    const found = sections.find((s) => s.slug.toLowerCase() === normalizedLast);
    if (found) return found;
  }

  return sections[0];
}

/**
 * Extracts a clean snippet around a search match.
 */
function extractSnippet(text: string, query: string, maxLength = 140): string {
  const lowerText = normalizeSearchText(text);
  const lowerQuery = normalizeSearchText(query);
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) {
    return text.slice(0, maxLength).trim() + (text.length > maxLength ? "..." : "");
  }

  const start = Math.max(0, index - 40);
  const end = Math.min(text.length, index + query.length + 80);
  let snippet = text.slice(start, end).replace(/\s+/g, " ").trim();

  if (start > 0) snippet = "..." + snippet;
  if (end < text.length) snippet = snippet + "...";

  return snippet;
}

function normalizeSearchText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("id-ID");
}

/**
 * Searches sections and blocks for matching queries within an article.
 */
export function searchArticleContent(
  sections: readonly PublicSectionReadModel[],
  query: string,
): SearchMatchResult[] {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 2 || !sections) return [];

  const lowerQuery = normalizeSearchText(trimmed);
  const results: SearchMatchResult[] = [];

  for (const section of sections) {
    // Check section title
    if (normalizeSearchText(section.title).includes(lowerQuery)) {
      results.push({
        sectionId: section.id,
        sectionSlug: section.slug,
        sectionTitle: section.title,
        sectionNumber: section.sectionNumber,
        snippet: section.title,
        matchType: "title",
      });
      continue;
    }

    // Check section learning objective
    if (section.learningObjective && normalizeSearchText(section.learningObjective).includes(lowerQuery)) {
      results.push({
        sectionId: section.id,
        sectionSlug: section.slug,
        sectionTitle: section.title,
        sectionNumber: section.sectionNumber,
        snippet: extractSnippet(section.learningObjective, trimmed),
        matchType: "objective",
      });
      continue;
    }

    // Check section blocks
    for (const block of section.blocks) {
      if (block.title && normalizeSearchText(block.title).includes(lowerQuery)) {
        results.push({
          sectionId: section.id,
          sectionSlug: section.slug,
          sectionTitle: section.title,
          sectionNumber: section.sectionNumber,
          snippet: block.title,
          matchType: "block",
          blockTitle: block.title,
        });
        break;
      }

      if (block.content && normalizeSearchText(block.content).includes(lowerQuery)) {
        // Strip markdown code fences or symbols for cleaner snippet preview
        const cleanContent = block.content.replace(/[`#*_~]/g, " ");
        results.push({
          sectionId: section.id,
          sectionSlug: section.slug,
          sectionTitle: section.title,
          sectionNumber: section.sectionNumber,
          snippet: extractSnippet(cleanContent, trimmed),
          matchType: "block",
          blockTitle: block.title,
        });
        break;
      }
    }
  }

  return results;
}

/**
 * Pure function to build a sanitized, serializable public article read model.
 * Strictly redacts all internal Idea/source/provenance/hash/identity fields.
 */
export function buildPublicArticleReadModel(
  rawArticle: {
    id: string;
    mataKuliahId?: string;
    courseId?: string;
    babId?: string | null;
    slug: string;
    title: string;
    version: number;
    status?: string;
    [key: string]: unknown;
  },
  rawSections: Array<{
    id: string;
    artikelId?: string;
    parentSectionId?: string | null;
    sectionKind?: "overview" | "topic" | "summary" | string;
    slug: string;
    title: string;
    learningObjective?: string | null;
    orderIndex?: number | null;
    estimatedReadingMinutes?: number | null;
    version?: number;
    status?: string;
    [key: string]: unknown;
  }>,
  rawBlocks: Array<{
    id: string;
    bagianArtikelId?: string | null;
    blockKey?: string;
    blockType: string;
    title?: string | null;
    orderIndex?: number | null;
    content: string;
    version?: number;
    status?: string;
    [key: string]: unknown;
  }>,
  rawProgress?: Array<{
    bagianArtikelId: string;
    maxReadPercent: number;
    timeSpentSeconds?: number | null;
    completedAt?: Date | string | null;
    lastReadAt?: Date | string | null;
    [key: string]: unknown;
  }> | null,
  chapter?: string | { id: string | null; title?: string | null; number?: number | null; courseTitle?: string | null } | null,
): PublicArticleReadModel {
  const chapterId = typeof chapter === "string" ? chapter : chapter?.id ?? rawArticle.babId ?? null;
  const chapterNumber = typeof chapter === "object" && chapter ? chapter.number ?? null : null;
  // Filter published sections only if status is present
  const validSections = (rawSections || [])
    .filter((s) => !s.status || s.status === "published")
    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0) || a.id.localeCompare(b.id));

  // Compute numbering
  const sectionNumberMap = computeDeterministicSectionNumbering(
    validSections.map((s, idx) => ({
      id: s.id,
      orderIndex: s.orderIndex ?? idx,
      parentSectionId: s.parentSectionId ?? null,
      sectionKind: s.sectionKind,
    })),
    chapterNumber ?? undefined,
  );

  // Filter published blocks only if status is present
  const validBlocks = (rawBlocks || [])
    .filter((b) => !b.status || b.status === "published")
    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0) || a.id.localeCompare(b.id));

  // Group blocks by section
  const blocksBySection = new Map<string, PublicBlockReadModel[]>();
  for (const b of validBlocks) {
    if (!b.bagianArtikelId) continue;
    const existing = blocksBySection.get(b.bagianArtikelId) ?? [];
    existing.push({
      id: b.id,
      blockKey: b.blockKey || `block-${b.id}`,
      blockType: b.blockType,
      title: b.title ?? null,
      orderIndex: b.orderIndex ?? 0,
      content: b.content,
    });
    blocksBySection.set(b.bagianArtikelId, existing);
  }

  // Build public sections
  const publicSections: PublicSectionReadModel[] = validSections.map((s, idx) => {
    const rawKind = s.sectionKind;
    const sectionKind: "overview" | "topic" | "summary" =
      rawKind === "overview" || rawKind === "summary" ? rawKind : "topic";

    const readingMins =
      typeof s.estimatedReadingMinutes === "number" && s.estimatedReadingMinutes > 0
        ? s.estimatedReadingMinutes
        : 3;

    return {
      id: s.id,
      slug: s.slug,
      title: s.title,
      sectionNumber: sectionNumberMap.get(s.id) || String(idx + 1),
      sectionKind,
      learningObjective: s.learningObjective || "",
      estimatedReadingMinutes: readingMins,
      orderIndex: s.orderIndex ?? idx,
      parentSectionId: s.parentSectionId ?? null,
      blocks: blocksBySection.get(s.id) ?? [],
    };
  });

  const totalEstimatedReadingMinutes = publicSections.reduce(
    (acc, s) => acc + s.estimatedReadingMinutes,
    0,
  );

  // Compute progress if provided
  let progress: PublicArticleProgress | null = null;
  if (rawProgress && rawProgress.length > 0) {
    const sectionProgress: Record<string, SectionProgressDetail> = {};
    let mostRecentDate: number = 0;
    let lastSectionSlug: string | null = null;
    let completedCount = 0;

    const sectionSlugById = new Map(publicSections.map((s) => [s.id, s.slug]));

    for (const p of rawProgress) {
      const isCompleted = p.maxReadPercent >= 90 || Boolean(p.completedAt);
      if (isCompleted) completedCount++;
      const lastReadDate = p.lastReadAt ? new Date(p.lastReadAt).getTime() : 0;
      if (lastReadDate > mostRecentDate) {
        mostRecentDate = lastReadDate;
        lastSectionSlug = sectionSlugById.get(p.bagianArtikelId) ?? null;
      }

      sectionProgress[p.bagianArtikelId] = {
        maxReadPercent: Math.min(100, Math.max(0, p.maxReadPercent || 0)),
        completed: isCompleted,
        timeSpentSeconds: Math.max(0, p.timeSpentSeconds || 0),
        lastReadAt: p.lastReadAt ? new Date(p.lastReadAt).toISOString() : null,
      };
    }

    const totalSectionsCount = publicSections.length || 1;
    const overallPercent = Math.min(100, Math.round((completedCount / totalSectionsCount) * 100));
    const completed = completedCount >= totalSectionsCount;

    progress = {
      completed,
      overallPercent,
      lastSectionSlug,
      sectionProgress,
    };
  }

  const courseId = (rawArticle.courseId || rawArticle.mataKuliahId || "") as string;

  return {
    id: rawArticle.id,
    courseId,
    chapterId: chapterId ?? rawArticle.babId ?? null,
    slug: rawArticle.slug,
    title: rawArticle.title,
    courseTitle: typeof chapter === "object" && chapter ? chapter.courseTitle ?? "" : "",
    chapterTitle: typeof chapter === "object" && chapter ? chapter.title ?? null : null,
    chapterNumber,
    version: rawArticle.version,
    sections: publicSections,
    totalEstimatedReadingMinutes: Math.max(1, totalEstimatedReadingMinutes),
    progress,
  };
}
