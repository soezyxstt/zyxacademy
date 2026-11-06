"use server";

import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { courses, mataKuliah } from "@/db/schema";
import { assertTutorOrAdmin } from "@/lib/auth/admin-guards";
import {
  historicalReviewActionFor,
  normalizeHistoricalQuery,
  normalizeQuestionQuery,
  type HistoricalQuestionQuery,
  type HistoricalSelectionItem,
  type QuestionQuery,
} from "./question-query-state";
import { activeQuestionQuery, historicalQuestionQuery } from "./active-question-query";

async function loadQuestionCourseMaps() {
  const [legacy, canonical] = await Promise.all([
    db.select({ id: courses.id, title: courses.title }).from(courses).orderBy(asc(courses.title)),
    db.select({ id: mataKuliah.id, title: mataKuliah.title, code: mataKuliah.code, legacyCourseId: mataKuliah.legacyCourseId }).from(mataKuliah).where(eq(mataKuliah.status, "active")).orderBy(asc(mataKuliah.title)),
  ]);
  const labels: Record<string, string> = {};
  const identities: Record<string, string> = {};
  for (const row of legacy) { labels[row.id] = row.title; identities[row.id] = row.id; }
  for (const row of canonical) {
    for (const id of [row.id, row.legacyCourseId, row.code]) {
      if (id) { labels[id] = row.title; identities[id] = row.id; }
    }
  }
  return { labels, identities };
}

// Resolve all matching IDs only after an explicit select-all action. The existing
// mutation endpoint reauthorizes and reloads these exact IDs before writing.
export async function matchingActiveQuestionIds(rendered: QuestionQuery) {
  await assertTutorOrAdmin();
  const { labels, identities } = await loadQuestionCourseMaps();
  return (await activeQuestionQuery(db, normalizeQuestionQuery({ tab: rendered.tab, qSearch: rendered.search, qCourse: rendered.course, qStatus: rendered.status, qOrigin: rendered.origin, qType: rendered.type, qDifficulty: rendered.difficulty }), labels, identities).ids()).map((row) => row.id);
}

export async function matchingHistoricalQuestionItems(rendered: HistoricalQuestionQuery): Promise<HistoricalSelectionItem[]> {
  await assertTutorOrAdmin();
  const { labels, identities } = await loadQuestionCourseMaps();
  const rows = await historicalQuestionQuery(
    db,
    normalizeHistoricalQuery({
      tab: rendered.tab,
      hSearch: rendered.search,
      hCourse: rendered.course,
      hCategory: rendered.category,
      hDifficulty: rendered.difficulty,
    }),
    labels,
    identities,
  ).selectionItems();
  return rows.filter((row) => historicalReviewActionFor(row) !== null);
}

