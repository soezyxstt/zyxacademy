import { expect, test } from "bun:test";
import { indexMasteryTopics } from "@/lib/student/mastery-topic-labels";

test("shared concepts preserve the Idea statement and score for each result", () => {
  const common = { conceptDisplayName: "Roots", fallbackName: "Akar", conceptSlug: "roots" };
  const rows = [
    { ...common, id: "a", statement: "Simplify square roots", score: 10 },
    { ...common, id: "b", statement: "Compare two square roots", score: 83 },
  ];
  const topics = indexMasteryTopics(rows);
  for (const row of rows) {
    expect(topics.get(row.id)).toMatchObject({ conceptName: row.statement, score: row.score, conceptSlug: "roots" });
  }
});

test("display names follow the requested language and link only to available concepts", () => {
  const idea = { statement: "Original statement", conceptSlug: "roots", conceptDisplayName: "Square roots", fallbackName: "Akar kuadrat" };
  const resolve = (fields: Partial<typeof idea> | { conceptDisplayName: null; fallbackName?: null }) =>
    indexMasteryTopics([{ ...idea, ...fields, id: "idea" }]).get("idea");
  expect(resolve({})).toMatchObject({ conceptName: "Square roots", conceptSlug: "roots" });
  expect(resolve({ conceptDisplayName: null })).toMatchObject({ conceptName: "Akar kuadrat", conceptSlug: "roots" });
  expect(resolve({ conceptDisplayName: null, fallbackName: null })).toMatchObject({ conceptName: "Original statement", conceptSlug: null });
});
