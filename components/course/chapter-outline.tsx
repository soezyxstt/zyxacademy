import type { ChapterOutlineItem } from "@/lib/course-utils";
import { ChapterOutlineList } from "@/components/course/chapter-outline-list";

type ChapterOutlineProps = { courseId: string; chapters: ChapterOutlineItem[]; isEnrolled: boolean };
export function ChapterOutline({ courseId, chapters }: ChapterOutlineProps) {
  return <ChapterOutlineList chapters={chapters.map((chapter, index) => ({
    id: chapter.id, title: chapter.title, number: index + 1, completed: chapter.completed,
    completionPercent: chapter.completionPercent, hasMaterial: chapter.hasMaterial,
    href: chapter.hasMaterial && chapter.materialId ? `/courses/${courseId}/material/${chapter.materialId}` : undefined,
  }))} />;
}
