import { afterAll, beforeAll, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableConfig } from "drizzle-orm/pg-core";
import { aiQuestionBank, assessmentSources, soal } from "../../db/schema";
import { activeQuestionQuery, historicalQuestionQuery } from "../../app/(admin)/admin/(eval)/questions/active-question-query";
import { historicalReviewActionFor, normalizeHistoricalQuery, normalizeQuestionQuery } from "../../app/(admin)/admin/(eval)/questions/question-query-state";
import type { db as AppDb } from "../../db";

const client = new PGlite();
const database = drizzle(client) as unknown as Pick<typeof AppDb, "select">;
const labels = { canon: "Calculus", legacy: "Calculus", other: "Physics" };
const identities = { canon: "canon", legacy: "canon", other: "other" };

beforeAll(async () => {
  // Unconstrained columns also exercise legacy nullable data; production schema
  // uses primary keys, so distinct AI IDs cannot duplicate an equality join.
  for (const table of [soal, assessmentSources, aiQuestionBank]) {
    const config = getTableConfig(table);
    await client.exec(`create table "${config.name}" (${config.columns.map(c => `"${c.name}" ${c.getSQLType()}`).join(", ")})`);
  }
  await client.exec(`
    insert into assessment_sources (id, course_id, title, category) values
      ('s1', 'legacy', 'Midterm', 'uts'), ('s2', 'other', 'Practice', 'exercise');
    insert into soal (id, mata_kuliah_id, assessment_source_id, origin, prompt, difficulty, status, quiz_eligible, created_at, source_question_number, source_question_part) values
      ('a', 'canon', 's1', 'historical_reference', 'Integral', 'easy', 'draft', true, '2025-01-02', '4', 'b'),
      ('b', null, 's1', 'historical_reference', 'Derivative', 'hard', 'in_review', false, '2025-01-02', '5', null),
      ('c', 'other', 's2', 'historical_reference', 'Momentum', 'medium', 'published', true, '2025-01-01', null, null),
      ('d', 'canon', null, 'historical_reference', 'Limit', 'easy', 'retired', false, null, null, null),
      ('e', 'canon', 's1', 'zyx_original', 'Integral', 'easy', 'draft', true, '2025-01-03', null, null);
    insert into ai_question_bank (id, review_status, status) values ('a', 'flagged', 'retired'), ('c', 'generated', 'active'), ('unrelated', 'reviewed', 'active');
  `);
});
afterAll(async () => { await client.close(); });

test("active membership uses either nonhistorical origin while filters retain canonical origin", async () => {
  await client.exec(`insert into ai_question_bank (id, origin, review_status, status) values ('b', 'zyx_original', 'generated', 'active')`);
  try {
    const query = activeQuestionQuery(database, normalizeQuestionQuery({}), labels, identities);
    expect((await query.ids()).map(row => row.id)).toContain("b");
    const filtered = activeQuestionQuery(database, normalizeQuestionQuery({ qOrigin: "zyx_original" }), labels, identities);
    expect((await filtered.ids()).map(row => row.id)).not.toContain("b");
    expect((await query.count())[0].total).toBe(2);
  } finally {
    await client.exec(`delete from ai_question_bank where id = 'b'`);
  }
});

test("historical SQL count, pages and selection match the prior projection and filters", async () => {
  const cases = [
    { params: {}, ids: ["d", "a", "b", "c"], selected: ["a", "b", "c"] },
    { params: { hCourse: "legacy", hCategory: "uts" }, ids: ["a", "b"], selected: ["a", "b"] },
    { params: { hSearch: "4 b" }, ids: ["a"], selected: ["a"] },
    { params: { hSearch: "sumber tidak diketahui", hDifficulty: "easy" }, ids: ["d"], selected: [] },
    { params: { hSearch: "%" }, ids: [], selected: [] },
    { params: { hCourse: "other", hDifficulty: "medium" }, ids: ["c"], selected: ["c"] },
  ];
  for (const fixture of cases) {
    const query = historicalQuestionQuery(database, normalizeHistoricalQuery(fixture.params), labels, identities);
    expect((await query.count())[0].total).toBe(fixture.ids.length);
    const first = await query.ids().limit(2).offset(0);
    const second = await query.ids().limit(2).offset(2);
    expect([...first, ...second].map(row => row.id)).toEqual(fixture.ids);
    const selection = await query.selectionItems();
    expect(selection.filter(historicalReviewActionFor).map(row => row.id)).toEqual(fixture.selected);
  }
  const rows = await historicalQuestionQuery(database, normalizeHistoricalQuery({}), labels, identities).selectionItems();
  expect(rows.map(({ id, reviewStatus, quizEligible }) => [id, reviewStatus, quizEligible])).toEqual([
    ["d", "retired", false], ["a", "flagged", true], ["b", "reviewed", false], ["c", "generated", true],
  ]);
});
