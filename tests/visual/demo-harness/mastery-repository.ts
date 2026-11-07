import "server-only";
import { fixtureDelay } from "./demo-data";
import { buildDemoMastery } from "@/lib/demo/mastery";

export async function getDemoMastery(courseIds: string[]) {
  await fixtureDelay(2);
  return buildDemoMastery(courseIds.flatMap(courseId => [1, 2, 3].flatMap(chapterOrder => [1, 2, 3].map(index => ({
    courseId,
    chapterId: `${courseId}-chapter-${chapterOrder}`,
    chapterTitle: `Bab ${chapterOrder}`,
    chapterOrder,
    conceptName: `Topik ${chapterOrder}.${index} ${courseId}`,
  })))));
}
