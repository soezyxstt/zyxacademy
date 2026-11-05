import { expect, test } from "bun:test";
import { fictionalDemoProducts } from "@/lib/demo/fictional-products";
import { fictionalDemoSnapshot, publicDemoCourseTitles } from "@/lib/demo/fictional-snapshot";
import { sanitizeDemoArticle } from "@/lib/demo/public-content-sanitizer";

test("four course fallbacks are authored, scoped and safe for the public reader", () => {
  for (const [index, title] of publicDemoCourseTitles.entries()) {
    const course = { id: `course-${index}`, title };
    const result = fictionalDemoProducts(course, { id: "first", title: "First chapter", orderIndex: 1 });
    expect(result).not.toBeNull();
    expect(result?.article.courseId).toBe(course.id);
    expect(result?.article.chapterId).toBe("first");
    expect(sanitizeDemoArticle(result!.article).sections[0].blocks).toHaveLength(1);
    expect(result?.quiz).toHaveLength(3);
    expect(result?.quiz.every(q => q.id.startsWith(`fictional-${course.id}-`) && q.options[0] !== q.options[1])).toBe(true);
    expect(fictionalDemoSnapshot(course.id).courseId).toBe(course.id);
    expect(JSON.stringify(result)).not.toMatch(/https?:|fileKey|downloadUrl/);
  }
  expect(fictionalDemoProducts({ id: "other", title: "Other" }, { id: "first", title: "First", orderIndex: 1 })).toBeNull();
});

test("fictional course baselines vary and agree with their history", () => {
  const snapshots = publicDemoCourseTitles.map((title, index) => fictionalDemoSnapshot(`course-${index}`, title));
  expect(new Set(snapshots.map(snapshot => snapshot.course.completedMaterials)).size).toBe(4);
  expect(new Set(snapshots.map(snapshot => snapshot.flashcards.dueCount)).size).toBe(4);
  for (const snapshot of snapshots) {
    expect(snapshot.history.reduce((sum, day) => sum + day.materialsCompleted, 0)).toBe(snapshot.course.completedMaterials);
    expect(snapshot.revision).toBe("demo-2026-11-05-v2");
  }
});
