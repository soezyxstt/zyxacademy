import { slugifySegment } from "@/lib/storage/keys";

export type LegacyArticleClassification = "deterministic_convertible" | "needs_reauthoring";

export type LegacySectionPlan = {
  kind: "overview" | "topic" | "summary";
  title: string;
  slug: string;
  contentMarkdown: string;
  orderIndex: number;
};

export type LegacyArticlePlan = {
  classification: LegacyArticleClassification;
  reason: string;
  sections: LegacySectionPlan[];
};

function wordCount(value: string): number {
  return value.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
}

export function planLegacyArticleConversion(contentMarkdown: string): LegacyArticlePlan {
  const text = contentMarkdown.trim();
  const headings = [...text.matchAll(/^##\s+([^#\n].+)$/gm)];
  if (headings.length < 3) {
    return { classification: "needs_reauthoring", reason: "trusted_heading_outline_missing", sections: [] };
  }

  const firstHeadingOffset = headings[0].index ?? 0;
  const introduction = text.slice(0, firstHeadingOffset).replace(/^#\s+.+$/m, "").trim();
  if (wordCount(introduction) < 40) {
    return { classification: "needs_reauthoring", reason: "overview_not_explicit", sections: [] };
  }

  const parsed = headings.map((heading, index) => {
    const start = (heading.index ?? 0) + heading[0].length;
    const end = headings[index + 1]?.index ?? text.length;
    return { title: heading[1].trim(), content: text.slice(start, end).trim() };
  });
  const summaryIndex = parsed.findIndex((section) => /^(ringkasan|summary|sintesis|penutup)\b/i.test(section.title));
  const topics = parsed.filter((_, index) => index !== summaryIndex);
  if (summaryIndex < 0 || topics.length < 2 || parsed.some((section) => wordCount(section.content) < 20)) {
    return { classification: "needs_reauthoring", reason: "pedagogical_boundaries_ambiguous", sections: [] };
  }

  const usedSlugs = new Set<string>();
  const uniqueSlug = (title: string) => {
    const base = slugifySegment(title);
    let slug = base;
    let suffix = 2;
    while (usedSlugs.has(slug)) slug = `${base}-${suffix++}`;
    usedSlugs.add(slug);
    return slug;
  };
  const sections: LegacySectionPlan[] = [
    { kind: "overview", title: "Ikhtisar", slug: uniqueSlug("ikhtisar"), contentMarkdown: introduction, orderIndex: 0 },
    ...parsed.map((section, index): LegacySectionPlan => ({
      kind: index === summaryIndex ? "summary" : "topic",
      title: section.title,
      slug: uniqueSlug(section.title),
      contentMarkdown: section.content,
      orderIndex: index + 1,
    })),
  ];
  return { classification: "deterministic_convertible", reason: "trusted_heading_outline", sections };
}

export function hasMeaningfulReauthoredOutline(topicTitles: readonly string[]): boolean {
  const normalized = topicTitles.map((title) => title.trim().toLocaleLowerCase("id-ID")).filter(Boolean);
  return normalized.length >= 2 && normalized.every((title) => !/^(materi|topik|bagian|chapter|bab)(\s+\d+)?$/.test(title));
}
