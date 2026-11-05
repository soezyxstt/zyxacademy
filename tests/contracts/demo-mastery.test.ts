import { expect, test } from "bun:test";
import { buildDemoMastery } from "@/lib/demo/mastery";

test("builds stable, varied fictional mastery for each course and chapter", () => {
  const rows = [
    { courseId: "math", chapterId: "m1", chapterTitle: "Bab 1", chapterOrder: 1, conceptName: "Bilangan" },
    { courseId: "math", chapterId: "m2", chapterTitle: "Bab 2", chapterOrder: 2, conceptName: "Fungsi" },
    { courseId: "physics", chapterId: "p1", chapterTitle: "Bab 1", chapterOrder: 1, conceptName: "Gaya" },
    { courseId: "chemistry", chapterId: "c1", chapterTitle: "Bab 1", chapterOrder: 1, conceptName: "Atom" },
  ];
  const models = buildDemoMastery([...rows, rows[0]]);
  expect(Object.keys(models)).toEqual(["math", "physics", "chemistry"]);
  expect(models.math.groups.map(group => group.chapter.id)).toEqual(["m1", "m2"]);
  expect(models.math.groups[0].concepts).toHaveLength(1);
  expect(models).toEqual(buildDemoMastery([...rows, rows[0]]));
  const scores = Object.values(models).flatMap(model => model.graphNodes.map(node => node.mastery));
  expect(new Set(scores).size).toBeGreaterThan(1);
  expect(scores.every(score => score >= 0 && score <= 100)).toBe(true);
});
