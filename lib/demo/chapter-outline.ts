import type { PublicDemoSnapshot } from "@/lib/demo/snapshot";
import type { DemoOverlay } from "@/lib/demo/session-overlay";
import type { ChapterOutlineRow } from "@/components/course/chapter-outline-list";

/** Only the first chapter receives a destination; mock metadata is never resolved as content. */
export function demoChapterOutline({ snapshot, chapterTitle, articleId, overlay, articleHref, availableLabel, mockLabel }: {
  snapshot: PublicDemoSnapshot;
  chapterTitle: string;
  articleId: string;
  overlay: DemoOverlay;
  articleHref: string;
  availableLabel: string;
  mockLabel: (percent: number) => string;
}): ChapterOutlineRow[] {
  const completed = overlay.events.some((event) => event.kind === "article" && event.id === `demo-article-${articleId}`.slice(0, 128));
  const first: ChapterOutlineRow = { id: "demo-first-chapter", title: chapterTitle, number: 1, completionPercent: completed ? 100 : 0, completed, hasMaterial: true, href: articleHref, statusLabel: completed ? undefined : availableLabel };
  const mocked = [...(snapshot.mockChapters ?? [])].sort((a, b) => a.orderIndex - b.orderIndex || a.id.localeCompare(b.id));
  return [first, ...mocked.map((chapter, index) => ({ id: `mock-${chapter.id}`, title: chapter.title, number: index + 2, completed: chapter.completionPercent === 100, completionPercent: chapter.completionPercent, hasMaterial: false, statusLabel: mockLabel(chapter.completionPercent) }))];
}
