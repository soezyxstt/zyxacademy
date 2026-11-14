export type DemoCatalogueChapter = { id: string; title: string; orderIndex: number; fictional?: boolean };
export type DemoCatalogueMaterial = { id: string; title: string; chapterId: string; chapterIds?: string[]; kind: "article" | "diktat" | "website" | "pdf"; category?: "materi" | "soal" | "solusi"; subcategory?: string | null; year?: number | null };
export type DemoCatalogue = { chapters: DemoCatalogueChapter[]; materials: DemoCatalogueMaterial[] };

/** Admin-added chapters always precede the fictional padding. */
export function padDemoChapters(title: string, chapters: DemoCatalogueChapter[]): DemoCatalogueChapter[] {
  if (title !== "Berpikir Komputasional" || chapters.length >= 5) return chapters;
  return [...chapters, ...Array.from({ length: 5 - chapters.length }, (_, index) => ({
    id: `fictional-padding-${index + 1}`, title: `Bab berikutnya ${index + 1}`,
    orderIndex: (chapters.at(-1)?.orderIndex ?? 0) + index + 1, fictional: true,
  }))];
}

export function padDemoCatalogue(title: string, chapters: DemoCatalogueChapter[], materials: DemoCatalogueMaterial[]): DemoCatalogue {
  const padded = padDemoChapters(title, chapters);
  const titles = ["Dekomposisi masalah", "Mengenali pola", "Abstraksi", "Menyusun algoritma"];
  return { chapters: padded, materials: [...materials, ...padded.filter(chapter => chapter.fictional).map((chapter, index) => ({
    id: `fictional-material-${chapter.id}`, title: titles[index % titles.length], chapterId: chapter.id, kind: "article" as const,
  }))] };
}

export function fictionalChapterPercent(courseId: string, index: number): number {
  const seed = [...courseId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const profiles = [[100, 78, 42, 15, 0], [100, 55, 20, 0, 0], [85, 64, 35, 10, 0], [90, 45, 25, 0, 0]];
  return index < 5 ? profiles[seed % profiles.length][index] : [0, 15, 30, 45][(seed + index * 7) % 4];
}

export function fictionalMaterialCompleted(courseId: string, material: DemoCatalogueMaterial, chapterIndex: number): boolean {
  if (chapterIndex === 0 && (material.kind === "article" || material.kind === "diktat")) return false;
  let hash = 0;
  for (const character of `${courseId}:${material.id}`) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % 100 < fictionalChapterPercent(courseId, chapterIndex);
}

export function catalogueProgress(courseId: string, catalogue: DemoCatalogue) {
  const completed = catalogue.materials.filter(material => {
    const index = catalogue.chapters.findIndex(chapter => chapter.id === material.chapterId);
    return index >= 0 && fictionalMaterialCompleted(courseId, material, index);
  });
  return { total: catalogue.materials.length, completed: completed.length };
}

export function addSelectedFallback(catalogue: DemoCatalogue, selected: { articleId?: string; diktatId?: string }, titles: { article: string; diktat: string }): DemoCatalogue {
  const first = catalogue.chapters[0];
  if (!first) return catalogue;
  const materials = [...catalogue.materials];
  for (const item of [{ id: selected.articleId, title: titles.article, kind: "article" as const }, { id: selected.diktatId, title: titles.diktat, kind: "diktat" as const }]) {
    if (item.id && !materials.some(existing => existing.id === item.id)) materials.push({ ...item, id: item.id, chapterId: first.id });
  }
  return { ...catalogue, materials };
}
