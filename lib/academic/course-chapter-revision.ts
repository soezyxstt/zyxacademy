import { revisionOf } from "@/lib/admin-mcp/revision";

type ChapterRow = { id: string };

export function courseChapterRevision(courseId: string, legacyCourseId: string | null, canonical: readonly ChapterRow[], legacy: readonly ChapterRow[]) {
  const byId = (left: ChapterRow, right: ChapterRow) => left.id < right.id ? -1 : Number(left.id > right.id);
  return revisionOf({ courseId, legacyCourseId, canonical: [...canonical].sort(byId), legacy: [...legacy].sort(byId) });
}
