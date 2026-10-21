import { resolveCourseAccess, canAccessCourseContent } from "@/lib/student/course-access";
import { resolveSourceFigureForCourse } from "@/lib/authoring/source-figures";
import { sourceFigureVisualSpecSchema } from "@/lib/materials/visual-contract";
import type { PublicArticleReadModel, PublicSourceFigureVisualSpec, PublicVisualSpec } from "./structured-read-model";

export function sourceFigureImagePath(courseId: string, articleId: string, visualId: string): string {
  return `/api/courses/${encodeURIComponent(courseId)}/articles/${encodeURIComponent(articleId)}/source-figures/${encodeURIComponent(visualId)}`;
}

type FigureManifest = { sourceChecksum: string; publicationAllowed: boolean; attribution: string; variants: { name: "preview" | "print"; width: number; height: number }[] };
type Dependencies = {
  authorize: (courseId: string, userId: string, chapterIds: readonly string[]) => Promise<boolean>;
  resolve: (input: { courseId: string; materialId: string; assetId: string }) => Promise<FigureManifest>;
};
const defaults: Dependencies = {
  authorize: async (courseId, userId, chapterIds) => canAccessCourseContent(await resolveCourseAccess({ courseId, userId }), "article", chapterIds),
  resolve: resolveSourceFigureForCourse,
};

/** Callers without a verified learner/operator scope receive only the text fallback. */
export async function hydrateSourceFiguresForReader(
  article: PublicArticleReadModel,
  rawVisuals: readonly unknown[],
  scope: { courseId: string; legacyCourseId: string | null; userId?: string },
  deps: Dependencies = defaults,
): Promise<PublicArticleReadModel> {
  const figures = rawVisuals.flatMap((raw) => { const parsed = sourceFigureVisualSpecSchema.safeParse(raw); return parsed.success ? [parsed.data] : []; });
  if (!figures.length || !scope.userId || !scope.legacyCourseId) return article;
  if (!await deps.authorize(scope.courseId, scope.userId, article.chapterId ? [article.chapterId] : [])) return article;
  const resolved = new Map<string, PublicSourceFigureVisualSpec["asset"]>();
  await Promise.all(figures.map(async (figure) => {
    try {
      const manifest = await deps.resolve({ courseId: scope.legacyCourseId!, materialId: figure.materialId, assetId: figure.assetId });
      const preview = manifest.variants.find((variant) => variant.name === "preview");
      if (!manifest.publicationAllowed || manifest.sourceChecksum !== figure.sourceChecksum || !preview) return;
      resolved.set(figure.id, { assetId: figure.assetId, imageUrl: sourceFigureImagePath(scope.courseId, article.id, figure.id), attribution: manifest.attribution, width: preview.width, height: preview.height });
    } catch {
      // A stale or unavailable asset keeps the authored accessible fallback.
    }
  }));
  const hydrate = (visual: PublicVisualSpec): PublicVisualSpec => visual.kind === "source_figure" ? { ...visual, asset: resolved.get(visual.id)?.assetId === visual.assetId ? resolved.get(visual.id) : undefined } : visual;
  return { ...article, visuals: article.visuals?.map(hydrate), sections: article.sections.map((section) => ({ ...section, visuals: section.visuals?.map(hydrate), blocks: section.blocks.map((block) => ({ ...block, visuals: block.visuals?.map(hydrate) })) })) };
}
