import { and, asc, count, desc, eq, ne, or, sql } from "drizzle-orm";
import type { db } from "@/db";
import { aiQuestionBank, assessmentSources, soal } from "@/db/schema";
import {
  questionTagSearchText,
  type HistoricalQuestionQuery,
  type HistoricalReviewStatus,
  type QuestionQuery,
} from "./question-query-state";

// Filter the same per-field canonical/compatibility projection used by page.tsx.
// Retired rows are excluded independently before joining, as in the old reader.
export function activeQuestionQuery(database: Pick<typeof db, "select">, state: QuestionQuery, courseMap: Record<string, string>, canonicalMap: Record<string, string>) {
  const a = database.select().from(aiQuestionBank).where(ne(aiQuestionBank.status, "retired")).as("active_ai");
  const c = database.select().from(soal).where(ne(soal.status, "retired")).as("active_canonical");
  const courseId = sql<string>`coalesce(${c.mataKuliahId}, ${a.courseId}, '')`;
  const origin = sql<string>`coalesce(${c.origin}, ${a.origin}, 'zyx_original')`;
  const projection = database.select({
    id: sql<string>`coalesce(${a.id}, ${c.id})`.as("question_id"),
    courseId: courseId.as("effective_course"),
    origin: origin.as("effective_origin"),
    status: sql<string>`coalesce(${a.reviewStatus}, case ${c.status} when 'in_review' then 'reviewed' when 'published' then 'published' when 'retired' then 'retired' else 'generated' end)`.as("effective_status"),
    difficulty: sql<string>`coalesce(${c.difficulty}, ${a.difficulty}, 'medium')`.as("effective_difficulty"),
    type: sql<string>`coalesce(${c.questionType}, ${a.questionType}, 'multiple_choice')`.as("effective_type"),
    createdAt: sql<Date>`coalesce(${a.createdAt}, ${c.createdAt})`.as("effective_created"),
    search: sql<string>`lower(concat_ws(' ', nullif(coalesce(${c.prompt}, ${a.prompt}, ''), ''), nullif(coalesce(${c.sourceEventName}, ${a.sourceEventName}), ''), nullif(coalesce(${c.sourceReferenceId}, ${a.sourceReferenceId}), ''), nullif(${JSON.stringify(courseMap)}::jsonb ->> ${courseId}, ''), nullif(case when jsonb_typeof(${a.tags}) = 'array' then (with recursive tag_values(value, path) as (
      select value, array[ordinal::int] from jsonb_array_elements(${a.tags}) with ordinality as tag(value, ordinal)
      where value not in ('null'::jsonb, 'false'::jsonb, '0'::jsonb, '""'::jsonb)
      union all
      select child.value, parent.path || child.ordinal::int from tag_values parent
      cross join lateral jsonb_array_elements(case when jsonb_typeof(parent.value) = 'array' then parent.value else '[]'::jsonb end) with ordinality as child(value, ordinal)
    ), rendered as (
      select path[1] as ordinal, string_agg(case jsonb_typeof(value) when 'object' then '[object Object]' when 'null' then '' when 'array' then '' else value #>> '{}' end, ',' order by path) as text
      from tag_values where jsonb_typeof(value) <> 'array' or value = '[]'::jsonb group by path[1]
    ) select string_agg(text, ' ' order by ordinal) from rendered) else '' end, '')))`.as("search_text"),
  }).from(a).fullJoin(c, eq(a.id, c.id)).where(or(ne(c.origin, "historical_reference"), ne(a.origin, "historical_reference"))).as("question_projection");
  const conditions = [
    state.status !== "all" ? eq(projection.status, state.status) : undefined,
    state.origin !== "all" ? eq(projection.origin, state.origin) : undefined,
    state.type !== "all" ? eq(projection.type, state.type) : undefined,
    state.difficulty !== "all" ? eq(projection.difficulty, state.difficulty) : undefined,
    state.course !== "all" ? sql`coalesce(${JSON.stringify(canonicalMap)}::jsonb ->> ${projection.courseId}, ${projection.courseId}) = ${canonicalMap[state.course] ?? state.course}` : undefined,
    // strpos treats %, _ and backslashes literally, matching String.includes.
    state.search.trim() ? sql`strpos(${projection.search}, ${state.search.trim().toLowerCase()}) > 0` : undefined,
  ];
  const where = and(...conditions);
  return {
    count: () => database.select({ total: count() }).from(projection).where(where),
    // Equal timestamps previously had undefined order. ID ascending makes page boundaries deterministic.
    ids: () => database.select({ id: projection.id }).from(projection).where(where).orderBy(desc(projection.createdAt), asc(projection.id)).$dynamic(),
  };
}

export function historicalQuestionQuery(
  database: Pick<typeof db, "select">,
  state: HistoricalQuestionQuery,
  courseMap: Record<string, string>,
  canonicalMap: Record<string, string>,
) {
  const courseId = sql<string>`coalesce(${soal.mataKuliahId}, ${assessmentSources.courseId}, '')`;
  const sourceTitle = sql<string>`coalesce(${assessmentSources.title}, 'Sumber tidak diketahui')`;
  const sourceCategory = sql<string>`coalesce(${assessmentSources.category}, 'other')`;
  const reviewStatus = sql<HistoricalReviewStatus>`coalesce(${aiQuestionBank.reviewStatus}, case ${soal.status} when 'in_review' then 'reviewed' when 'published' then 'published' when 'retired' then 'retired' else 'generated' end)`;
  const projection = database
    .select({
      id: soal.id,
      courseId: courseId.as("effective_course"),
      sourceTitle: sourceTitle.as("effective_source_title"),
      sourceCategory: sourceCategory.as("effective_source_category"),
      difficulty: soal.difficulty,
      reviewStatus: reviewStatus.as("effective_review_status"),
      quizEligible: soal.quizEligible,
      createdAt: soal.createdAt,
      search: sql<string>`lower(concat_ws(' ', nullif(${soal.prompt}, ''), nullif(${sourceTitle}, ''), nullif(${soal.sourceQuestionNumber}, ''), nullif(${soal.sourceQuestionPart}, ''), nullif(${JSON.stringify(courseMap)}::jsonb ->> ${courseId}, '')))`.as("historical_search_text"),
    })
    .from(soal)
    .leftJoin(assessmentSources, eq(soal.assessmentSourceId, assessmentSources.id))
    .leftJoin(aiQuestionBank, eq(aiQuestionBank.id, soal.id))
    .where(eq(soal.origin, "historical_reference"))
    .as("historical_projection");

  const conditions = [
    state.category !== "all" ? eq(projection.sourceCategory, state.category) : undefined,
    state.difficulty !== "all" ? eq(projection.difficulty, state.difficulty) : undefined,
    state.course !== "all"
      ? sql`coalesce(${JSON.stringify(canonicalMap)}::jsonb ->> ${projection.courseId}, ${projection.courseId}) = ${canonicalMap[state.course] ?? state.course}`
      : undefined,
    state.search.trim() ? sql`strpos(${projection.search}, ${state.search.trim().toLowerCase()}) > 0` : undefined,
  ];
  const where = and(...conditions);

  return {
    count: () => database.select({ total: count() }).from(projection).where(where),
    ids: () =>
      database
        .select({ id: projection.id })
        .from(projection)
        .where(where)
        .orderBy(desc(projection.createdAt), asc(projection.id))
        .$dynamic(),
    selectionItems: () =>
      database
        .select({
          id: projection.id,
          reviewStatus: projection.reviewStatus,
          quizEligible: projection.quizEligible,
        })
        .from(projection)
        .where(where)
        .orderBy(desc(projection.createdAt), asc(projection.id))
        .$dynamic(),
  };
}

export interface ActiveParityRowInput {
  id: string;
  ai?: {
    status?: string;
    courseId?: string | null;
    origin?: string | null;
    reviewStatus?: string | null;
    difficulty?: string | null;
    questionType?: string | null;
    prompt?: string | null;
    sourceEventName?: string | null;
    sourceReferenceId?: string | null;
    tags?: unknown;
    createdAt?: Date | number | null;
  } | null;
  canonical?: {
    status?: string;
    mataKuliahId?: string | null;
    origin?: string | null;
    difficulty?: string | null;
    questionType?: string | null;
    prompt?: string | null;
    sourceEventName?: string | null;
    sourceReferenceId?: string | null;
    createdAt?: Date | number | null;
  } | null;
}

export function evaluateActiveParityRows(
  rows: readonly ActiveParityRowInput[],
  state: QuestionQuery,
  courseMap: Record<string, string>,
  canonicalMap: Record<string, string>,
) {
  const projected = rows
    .flatMap((row) => {
      const ai = row.ai && row.ai.status !== "retired" ? row.ai : null;
      const canonical = row.canonical && row.canonical.status !== "retired" ? row.canonical : null;
      if (!ai && !canonical) return [];
      const origin = canonical?.origin ?? ai?.origin ?? "zyx_original";
      if (!((ai?.origin != null && ai.origin !== "historical_reference") || (canonical?.origin != null && canonical.origin !== "historical_reference"))) return [];
      const courseId = canonical?.mataKuliahId ?? ai?.courseId ?? "";
      const canonicalStatus = canonical?.status;
      const status =
        ai?.reviewStatus ??
        (canonicalStatus === "in_review"
          ? "reviewed"
          : canonicalStatus === "published"
            ? "published"
            : canonicalStatus === "retired"
              ? "retired"
              : "generated");
      const difficulty = canonical?.difficulty ?? ai?.difficulty ?? "medium";
      const type = canonical?.questionType ?? ai?.questionType ?? "multiple_choice";
      const rawCreated = ai?.createdAt ?? canonical?.createdAt ?? null;
      const createdAtMs = rawCreated instanceof Date ? rawCreated.getTime() : typeof rawCreated === "number" ? rawCreated : null;
      const search = [
        canonical?.prompt ?? ai?.prompt ?? "",
        canonical?.sourceEventName ?? ai?.sourceEventName ?? null,
        canonical?.sourceReferenceId ?? ai?.sourceReferenceId ?? null,
        courseMap[courseId] ?? null,
        questionTagSearchText(ai?.tags),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return [{ id: row.id, courseId, origin, status, difficulty, type, createdAtMs, search }];
    })
    .filter((item) => {
      if (state.status !== "all" && item.status !== state.status) return false;
      if (state.origin !== "all" && item.origin !== state.origin) return false;
      if (state.type !== "all" && item.type !== state.type) return false;
      if (state.difficulty !== "all" && item.difficulty !== state.difficulty) return false;
      if (state.course !== "all") {
        const resolvedRowCourse = canonicalMap[item.courseId] ?? item.courseId;
        const resolvedFilterCourse = canonicalMap[state.course] ?? state.course;
        if (resolvedRowCourse !== resolvedFilterCourse) return false;
      }
      const needle = state.search.trim().toLowerCase();
      if (needle && !item.search.includes(needle)) return false;
      return true;
    })
    .sort((a, b) => {
      if (a.createdAtMs === null && b.createdAtMs !== null) return -1;
      if (a.createdAtMs !== null && b.createdAtMs === null) return 1;
      if (a.createdAtMs !== null && b.createdAtMs !== null && b.createdAtMs !== a.createdAtMs) {
        return b.createdAtMs - a.createdAtMs;
      }
      return a.id.localeCompare(b.id);
    });

  return projected;
}

export interface HistoricalParityRowInput {
  id: string;
  origin?: string;
  mataKuliahId?: string | null;
  sourceCourseId?: string | null;
  prompt: string;
  sourceTitle?: string | null;
  sourceCategory?: string | null;
  sourceQuestionNumber?: string | null;
  sourceQuestionPart?: string | null;
  difficulty: "easy" | "medium" | "hard";
  canonicalStatus: "draft" | "in_review" | "published" | "retired";
  aiReviewStatus?: HistoricalReviewStatus | null;
  quizEligible: boolean;
  createdAt?: Date | number | null;
}

export function evaluateHistoricalParityRows(
  rows: readonly HistoricalParityRowInput[],
  state: HistoricalQuestionQuery,
  courseMap: Record<string, string>,
  canonicalMap: Record<string, string>,
) {
  return rows
    .filter((row) => (row.origin ?? "historical_reference") === "historical_reference")
    .map((row) => {
      const courseId = row.mataKuliahId ?? row.sourceCourseId ?? "";
      const sourceTitle = row.sourceTitle ?? "Sumber tidak diketahui";
      const sourceCategory = row.sourceCategory ?? "other";
      const reviewStatus: HistoricalReviewStatus =
        row.aiReviewStatus ??
        (row.canonicalStatus === "in_review"
          ? "reviewed"
          : row.canonicalStatus === "published"
            ? "published"
            : row.canonicalStatus === "retired"
              ? "retired"
              : "generated");
      const rawCreated = row.createdAt ?? null;
      const createdAtMs = rawCreated instanceof Date ? rawCreated.getTime() : typeof rawCreated === "number" ? rawCreated : null;
      const search = [
        row.prompt,
        sourceTitle,
        row.sourceQuestionNumber,
        row.sourceQuestionPart,
        courseMap[courseId],
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return {
        id: row.id,
        courseId,
        sourceTitle,
        sourceCategory,
        difficulty: row.difficulty,
        reviewStatus,
        quizEligible: row.quizEligible,
        createdAtMs,
        search,
      };
    })
    .filter((item) => {
      if (state.category !== "all" && item.sourceCategory !== state.category) return false;
      if (state.difficulty !== "all" && item.difficulty !== state.difficulty) return false;
      if (state.course !== "all") {
        const resolvedRowCourse = canonicalMap[item.courseId] ?? item.courseId;
        const resolvedFilterCourse = canonicalMap[state.course] ?? state.course;
        if (resolvedRowCourse !== resolvedFilterCourse) return false;
      }
      const needle = state.search.trim().toLowerCase();
      if (needle && !item.search.includes(needle)) return false;
      return true;
    })
    .sort((a, b) => {
      if (a.createdAtMs === null && b.createdAtMs !== null) return -1;
      if (a.createdAtMs !== null && b.createdAtMs === null) return 1;
      if (a.createdAtMs !== null && b.createdAtMs !== null && b.createdAtMs !== a.createdAtMs) {
        return b.createdAtMs - a.createdAtMs;
      }
      return a.id.localeCompare(b.id);
    });
}

