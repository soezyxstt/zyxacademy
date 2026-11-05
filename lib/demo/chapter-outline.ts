import type { DemoCatalogue } from "@/lib/demo/catalogue";
import { fictionalMaterialCompleted } from "@/lib/demo/catalogue";
import type { DemoOverlay } from "@/lib/demo/session-overlay";
import type { ChapterOutlineRow } from "@/components/course/chapter-outline-list";

export function demoChapterOutline({ courseId, catalogue, articleId, overlay, articleHref, progressLabel, partialPercent = 0 }: {
  courseId: string; catalogue: DemoCatalogue; articleId: string; overlay: DemoOverlay;
  articleHref: string; progressLabel: (percent: number) => string; partialPercent?: number;
}): ChapterOutlineRow[] {
  return catalogue.chapters.map((chapter, index) => {
    const locallyCompleted = index === 0 && overlay.events.some(event => event.kind === "article" && event.id === `demo-article-${articleId}`.slice(0, 128));
    const items = catalogue.materials.filter(material => material.chapterId === chapter.id);
    const completedCount = items.filter(material => fictionalMaterialCompleted(courseId, material, index) || (locallyCompleted && material.id === articleId)).length;
    const partial = index === 0 && !locallyCompleted && items.some(item => item.id === articleId) ? partialPercent / 100 : 0;
    const completionPercent = items.length ? Math.round((completedCount + partial) / items.length * 100) : 0;
    return { id: chapter.id, title: chapter.title, number: chapter.orderIndex, completionPercent,
      completed: completionPercent === 100, hasMaterial: index === 0,
      href: index === 0 ? articleHref : undefined, statusLabel: progressLabel(completionPercent) };
  });
}
