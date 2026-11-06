import { describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../../db/schema";
import {
  activeQuestionQuery,
  evaluateActiveParityRows,
  evaluateHistoricalParityRows,
  historicalQuestionQuery,
} from "../../app/(admin)/admin/(eval)/questions/active-question-query";
import {
  clampQuestionPage,
  createHistoricalQueryCoordinator,
  createQuestionQueryCoordinator,
  historicalQueryUrl,
  historicalReviewActionFor,
  normalizeHistoricalQuery,
  normalizeQuestionQuery,
  questionParamsFromUrl,
  questionQueryUrl,
  questionTagSearchText,
  toggleHistoricalQuestionEntries,
  toggleQuestionIds,
} from "../../app/(admin)/admin/(eval)/questions/question-query-state";

// Compilation only. This mock never connects to a database.
const database = drizzle.mock({ schema });

describe("question bank query", () => {
  test("normalizes repeated, invalid and excessive pagination values for active and historical queries", () => {
    const query = normalizeQuestionQuery({ tab: ["historical", "ai-generated"], qPage: "9007199254740992", qPageSize: "500", qStatus: "unknown", qDifficulty: "hard" });
    expect(query).toMatchObject({ tab: "historical", page: 1, pageSize: "10", status: "all", difficulty: "hard" });
    expect(normalizeQuestionQuery({ qPage: "2", qPageSize: "100" })).toMatchObject({ page: 2, pageSize: "100" });
    for (const qPage of ["-1", "0", "1.5", "Infinity", "1e3"]) expect(normalizeQuestionQuery({ qPage }).page).toBe(1);

    const historical = normalizeHistoricalQuery({
      tab: ["historical", "ai-generated"],
      hPage: "9007199254740992",
      hPageSize: "500",
      hCategory: ["uas", "uts"],
      hDifficulty: "unknown",
      hCourse: ["MA1101", "FI1101"],
      hSearch: ["  Deret Taylor  ", "ignored"],
    });
    expect(historical).toMatchObject({
      tab: "historical",
      page: 1,
      pageSize: "10",
      category: "uas",
      difficulty: "all",
      course: "MA1101",
      search: "  Deret Taylor  ",
    });
    expect(normalizeHistoricalQuery({ hPage: "3", hPageSize: "50", hCategory: "invalid" })).toMatchObject({
      page: 3,
      pageSize: "50",
      category: "all",
    });
    for (const hPage of ["-1", "0", "1.5", "Infinity", "1e3"]) {
      expect(normalizeHistoricalQuery({ hPage }).page).toBe(1);
    }
  });

  test("clamps out-of-range pages deterministically against filtered total and page size", () => {
    expect(clampQuestionPage(1, 0, 10)).toEqual({ page: 1, totalPages: 1 });
    expect(clampQuestionPage(5, 0, 10)).toEqual({ page: 1, totalPages: 1 });
    expect(clampQuestionPage(5, 25, 10)).toEqual({ page: 3, totalPages: 3 });
    expect(clampQuestionPage(2, 25, 10)).toEqual({ page: 2, totalPages: 3 });
    expect(clampQuestionPage(-3, 25, 10)).toEqual({ page: 1, totalPages: 3 });
  });

  test("compiles matching count and bounded ID predicates with literal search parameters for active questions", () => {
    const state = normalizeQuestionQuery({ qSearch: "  50%_\\ Integral  ", qCourse: "legacy", qStatus: "reviewed", qOrigin: "itb_example", qType: "essay", qDifficulty: "hard" });
    const query = activeQuestionQuery(database, state, { legacy: "Calculus", canonical: "Calculus" }, { legacy: "canonical", canonical: "canonical" });
    const count = query.count().toSQL();
    const page = query.ids().limit(10).offset(20).toSQL();
    expect(page.params.slice(0, -2)).toEqual(count.params);
    expect(page.params.slice(-2)).toEqual([10, 20]);
    expect(page.params).toContain("50%_\\ integral");
    expect(page.params).toContain("canonical");
    expect(page.params).toContain("reviewed");
    expect(page.params).toContain("itb_example");
    expect(page.params).toContain("essay");
    expect(page.params).toContain("hard");
    expect(page.sql).toContain("strpos(");
    expect(page.sql).toContain("full join");
    expect(page.sql).not.toContain("50%_");
    expect(count.sql).toContain("count(*)");
  });

  test("compiles matching count, bounded ID, and selection projections for historical questions", () => {
    const state = normalizeHistoricalQuery({
      tab: "historical",
      hSearch: "  Nomor 2a %_\\  ",
      hCourse: "legacy-course",
      hCategory: "uts",
      hDifficulty: "medium",
    });
    const query = historicalQuestionQuery(
      database,
      state,
      { "legacy-course": "Kalkulus IA", "canonical-course": "Kalkulus IA" },
      { "legacy-course": "canonical-course", "canonical-course": "canonical-course" }
    );
    const count = query.count().toSQL();
    const page = query.ids().limit(20).offset(40).toSQL();
    const selection = query.selectionItems().toSQL();

    expect(page.params.slice(0, -2)).toEqual(count.params);
    expect(selection.params).toEqual(count.params);
    expect(page.params.slice(-2)).toEqual([20, 40]);
    expect(page.params).toContain("historical_reference");
    expect(page.params).toContain("nomor 2a %_\\");
    expect(page.params).toContain("canonical-course");
    expect(page.params).toContain("uts");
    expect(page.params).toContain("medium");
    expect(page.sql).toContain("strpos(");
    expect(page.sql).toContain('left join "assessment_sources"');
    expect(page.sql).toContain('left join "ai_question_bank"');
    expect(page.sql).toMatch(/order by "historical_projection"\."created_at" desc, "historical_projection"\."id" asc/);
    expect(selection.sql).toContain("effective_review_status");
    expect(selection.sql).toStartWith('select "id", "effective_review_status", "quiz_eligible"');
    expect(count.sql).toContain("count(*)");
  });
});

describe("behavioral parity for active and historical pagination", () => {
  test("active parity resolves canonical vs legacy overrides, excludes historical_reference, and orders deterministically with nullable timestamps", () => {
    const rows = [
      { id: "q-1", canonical: { prompt: "Canonical prompt tentang matriks", mataKuliahId: "course-legacy", difficulty: "medium", origin: "zyx_original", createdAt: new Date("2026-01-02T00:00:00Z") }, ai: { reviewStatus: "reviewed", tags: ["eigen", 42], createdAt: new Date("2026-01-02T00:00:00Z") } },
      { id: "q-2", ai: { prompt: "Soal asli contoh ITB integral lipat", courseId: "course-canonical", difficulty: "medium", origin: "itb_example", reviewStatus: "reviewed", tags: [{ nested: true }], createdAt: new Date("2026-01-02T00:00:00Z") } },
      { id: "q-3", ai: { origin: "historical_reference", courseId: "course-canonical" } },
      { id: "q-0", canonical: { mataKuliahId: "course-canonical", difficulty: "medium", origin: "zyx_original", status: "in_review", createdAt: null } },
    ];

    const courseMap = { "course-legacy": "MA1101 Kalkulus", "course-canonical": "MA1101 Kalkulus" };
    const canonicalMap = { "course-legacy": "course-canonical", "course-canonical": "course-canonical" };

    const result = evaluateActiveParityRows(
      rows,
      normalizeQuestionQuery({ qCourse: "course-legacy", qStatus: "reviewed", qDifficulty: "medium", qPageSize: "10", qPage: "99" }),
      courseMap,
      canonicalMap
    );

    expect(result).toHaveLength(3);
    expect(clampQuestionPage(99, result.length, 10)).toEqual({ page: 1, totalPages: 1 });
    // PostgreSQL sorts null timestamps first in descending order, then ties by ID.
    expect(result.map(row => row.id)).toEqual(["q-0", "q-1", "q-2"]);

    const mixed = [{ id: "mixed", canonical: { origin: "historical_reference" }, ai: { origin: "zyx_original" } }];
    expect(evaluateActiveParityRows(mixed, normalizeQuestionQuery({}), {}, {}).map(row => row.id)).toEqual(["mixed"]);
    expect(evaluateActiveParityRows(mixed, normalizeQuestionQuery({ qOrigin: "zyx_original" }), {}, {})).toHaveLength(0);

    const tagSearch = evaluateActiveParityRows(
      rows,
      normalizeQuestionQuery({ qSearch: "[object Object]" }),
      courseMap,
      canonicalMap
    );
    expect(tagSearch.map(row => row.id)).toEqual(["q-2"]);
  });

  test("historical parity handles fallback source metadata, course resolution, review status overrides, and pagination clamping", () => {
    const historicalRows = [
      {
        id: "h-2",
        prompt: "Hitung limit fungsi trigonometri",
        mataKuliahId: null,
        sourceCourseId: "course-legacy",
        sourceTitle: "UTS Kalkulus 2023",
        sourceCategory: "uts" as const,
        sourceQuestionNumber: "3",
        sourceQuestionPart: "b",
        difficulty: "hard" as const,
        origin: "historical_reference" as const,
        canonicalStatus: "draft" as const,
        aiReviewStatus: "reviewed" as const,
        quizEligible: true,
        createdAt: new Date("2026-02-01T00:00:00Z"),
      },
      {
        id: "h-1",
        prompt: "Tentukan kekonvergenan deret",
        mataKuliahId: "course-canonical",
        sourceCourseId: null,
        sourceTitle: null,
        sourceCategory: null,
        sourceQuestionNumber: null,
        sourceQuestionPart: null,
        difficulty: "hard" as const,
        origin: "historical_reference" as const,
        canonicalStatus: "in_review" as const,
        aiReviewStatus: "flagged" as const,
        quizEligible: true,
        createdAt: new Date("2026-02-01T00:00:00Z"),
      },
      {
        id: "h-non-historical",
        prompt: "Soal latihan biasa",
        mataKuliahId: "course-canonical",
        sourceCourseId: "course-canonical",
        sourceTitle: "UTS Kalkulus 2023",
        sourceCategory: "uts" as const,
        difficulty: "hard" as const,
        origin: "zyx_original" as const,
        canonicalStatus: "draft" as const,
        quizEligible: false,
        createdAt: new Date("2026-03-01T00:00:00Z"),
      },
    ];

    const courseMap = { "course-legacy": "MA1101 Kalkulus", "course-canonical": "MA1101 Kalkulus" };
    const canonicalMap = { "course-legacy": "course-canonical", "course-canonical": "course-canonical" };

    const allCourseMatch = evaluateHistoricalParityRows(
      historicalRows,
      normalizeHistoricalQuery({ tab: "historical", hCourse: "course-legacy", hDifficulty: "hard", hPage: "5", hPageSize: "10" }),
      courseMap,
      canonicalMap
    );
    expect(allCourseMatch).toHaveLength(2);
    expect(clampQuestionPage(5, allCourseMatch.length, 10)).toEqual({ page: 1, totalPages: 1 });
    // Equal timestamp -> tie-break by id asc: h-1 then h-2
    expect(allCourseMatch.map(row => row.id)).toEqual(["h-1", "h-2"]);
    expect(allCourseMatch.map(({ id, reviewStatus, quizEligible }) => ({ id, reviewStatus, quizEligible }))).toEqual([
      { id: "h-1", reviewStatus: "flagged", quizEligible: true },
      { id: "h-2", reviewStatus: "reviewed", quizEligible: true },
    ]);

    // Fallback source title ("Sumber tidak diketahui") and category ("other") are searchable and filterable
    const fallbackCategory = evaluateHistoricalParityRows(
      historicalRows,
      normalizeHistoricalQuery({ tab: "historical", hCategory: "other", hSearch: "sumber tidak diketahui" }),
      courseMap,
      canonicalMap
    );
    expect(fallbackCategory).toHaveLength(1);
    expect(fallbackCategory.map(row => row.id)).toEqual(["h-1"]);
  });
});

describe("cross-page question selection", () => {
  test("merges and removes matching active IDs without needing off-page rows", () => {
    const first = toggleQuestionIds(new Set(["outside-filter"]), ["page-1"]);
    const second = toggleQuestionIds(first, ["page-2"]);
    expect([...second]).toEqual(["outside-filter", "page-1", "page-2"]);
    const all = toggleQuestionIds(second, ["page-1", "page-2", "page-3", "page-3"]);
    expect([...all]).toEqual(["outside-filter", "page-1", "page-2", "page-3"]);
    expect([...toggleQuestionIds(all, ["page-1", "page-2", "page-3"])]).toEqual(["outside-filter"]);
    expect([...first]).toEqual(["outside-filter", "page-1"]);
    expect([...toggleQuestionIds(second, [])]).toEqual([...second]);
  });

  test("merges and removes historical selection items across pages while preserving review bucket metadata", () => {
    const outside = { id: "outside-h", reviewStatus: "generated", quizEligible: true };
    const p1 = { id: "h-page-1", reviewStatus: "reviewed", quizEligible: true };
    const p2 = { id: "h-page-2", reviewStatus: "reviewed", quizEligible: false };

    expect(historicalReviewActionFor(outside)).toBe("reviewed");
    expect(historicalReviewActionFor(p1)).toBe("published");
    expect(historicalReviewActionFor(p2)).toBe("flagged");
    expect(historicalReviewActionFor({ id: "h-pub", reviewStatus: "published", quizEligible: true })).toBeNull();

    const initial = new Map([[outside.id, outside]]);
    const withPage1 = toggleHistoricalQuestionEntries(initial, [p1]);
    const withAll = toggleHistoricalQuestionEntries(withPage1, [p1, p2]);
    expect([...withAll.keys()]).toEqual(["outside-h", "h-page-1", "h-page-2"]);

    const clearedCurrentFilter = toggleHistoricalQuestionEntries(withAll, [p1, p2]);
    expect([...clearedCurrentFilter.keys()]).toEqual(["outside-h"]);
    expect(clearedCurrentFilter.get("outside-h")).toEqual(outside);
  });
});

describe("immediate question query intent", () => {
  test("rapid typing, filter, clear and Back never merge stale server state for active and historical coordinators", () => {
    const initial = normalizeQuestionQuery({});
    const control = createQuestionQueryCoordinator(initial);
    control.change({ search: "i" });
    const sent = control.change({ search: "in" });
    control.change({ search: "integral" });
    expect(control.acknowledge(sent).search).toBe("integral");
    const filtered = control.change({ course: "A" });
    expect(filtered).toMatchObject({ search: "integral", course: "A", page: 1 });
    const url = questionQueryUrl("https://local/admin/questions?qCourse=B&qCourse=C&other=kept", filtered);
    expect(new URL(url, "https://local").searchParams.getAll("qCourse")).toEqual(["A"]);
    expect(url).toContain("other=kept");
    const cleared = control.change({ search: "" });
    expect(control.acknowledge(filtered)).toEqual(cleared);
    control.restore(initial);
    expect(control.acknowledge(cleared)).toEqual(initial);
    expect(control.acknowledge(initial)).toEqual(initial);
    expect(control.restore(filtered)).toEqual(filtered);

    const hInitial = normalizeHistoricalQuery({ tab: "historical" });
    const hControl = createHistoricalQueryCoordinator(hInitial);
    hControl.change({ search: "u" });
    const hSent = hControl.change({ search: "ut" });
    hControl.change({ search: "uts" });
    expect(hControl.acknowledge(hSent).search).toBe("uts");
    const hFiltered = hControl.change({ category: "uts", difficulty: "hard", page: 3 });
    expect(hFiltered).toMatchObject({ tab: "historical", search: "uts", category: "uts", difficulty: "hard", page: 1 });
    expect(hControl.change({ page: 3 }, false).page).toBe(3);
    const hUrl = historicalQueryUrl("https://local/admin/questions?qCourse=ACTIVE&hCategory=quiz&hCategory=uas&nested=1", hFiltered);
    const parsedHUrl = new URL(hUrl, "https://local");
    expect(parsedHUrl.searchParams.get("tab")).toBe("historical");
    expect(parsedHUrl.searchParams.getAll("hCategory")).toEqual(["uts"]);
    expect(parsedHUrl.searchParams.get("qCourse")).toBe("ACTIVE");
    expect(parsedHUrl.searchParams.get("nested")).toBe("1");
  });

  test("repeated parameters use the first value for list, count and selection", () => {
    const state = normalizeQuestionQuery(questionParamsFromUrl(new URLSearchParams("qCourse=A&qCourse=B&qSearch=first&qSearch=last")));
    expect(state).toMatchObject({ course: "A", search: "first" });
    const selection = normalizeQuestionQuery({ qCourse: state.course, qSearch: state.search });
    const list = activeQuestionQuery(database, state, {}, {});
    const ids = activeQuestionQuery(database, selection, {}, {}).ids().toSQL();
    expect(ids.params).toEqual(list.count().toSQL().params);
    expect(ids.params).toEqual(list.ids().toSQL().params);
    expect(ids.params).toContain("A");
    expect(ids.params).not.toContain("B");

    const hState = normalizeHistoricalQuery(questionParamsFromUrl(new URLSearchParams("tab=historical&hCourse=H1&hCourse=H2&hCategory=uts&hCategory=uas")));
    expect(hState).toMatchObject({ tab: "historical", course: "H1", category: "uts" });
    const hList = historicalQuestionQuery(database, hState, {}, {});
    expect(hList.selectionItems().toSQL().params).toEqual(hList.count().toSQL().params);
  });

  test("equal timestamps have an explicit ID ascending tie breaker without page duplicates", () => {
    const compiled = activeQuestionQuery(database, normalizeQuestionQuery({}), {}, {}).ids().toSQL();
    expect(compiled.sql).toMatch(/order by .*effective_created.*desc, .*question_id.*asc/);
    const rows = ["c", "a", "b", "d"].map(id => ({ id, created: 42 }));
    rows.sort((a, b) => b.created - a.created || a.id.localeCompare(b.id));
    const pages = [rows.slice(0, 2), rows.slice(2, 4)].flat().map(row => row.id);
    expect(pages).toEqual(["a", "b", "c", "d"]);
    expect(new Set(pages).size).toBe(4);
  });

  test("non-string tags retain JS coercion rather than serialized object content", () => {
    expect(questionTagSearchText([null, false, 0, "", true, 12, { secret: "no-json-search" }, ["x", null, ["y"]], []]))
      .toBe("true 12 [object Object] x,,y ");
    const sql = activeQuestionQuery(database, normalizeQuestionQuery({ qSearch: "object" }), {}, {}).ids().toSQL().sql;
    expect(sql).toContain("[object Object]");
    expect(sql).toContain("with recursive tag_values");
    expect(sql).not.toContain("jsonb_array_elements_text");
  });
});

test("client wiring debounces only search, cancels on history, and selects the rendered query on both tabs", async () => {
  const source = await Bun.file(new URL("../../app/(admin)/admin/(eval)/questions/questions-client.tsx", import.meta.url)).text();
  expect(source).toContain("setTimeout(pushIntent, 300)");
  expect(source).toContain('window.addEventListener("popstate", restore)');
  expect(source).toContain("cancelSearch();\n      setDraft(coordinator.current.restore");
  expect(source).toContain("matchingActiveQuestionIds(query)");
  expect(source).not.toContain("Object.fromEntries(new URLSearchParams");
  expect(source).not.toContain('onClear={() => setSearchQuery("")}');

  const historicalSource = await Bun.file(new URL("../../app/(admin)/admin/(eval)/questions/historical-questions-client.tsx", import.meta.url)).text();
  expect(historicalSource).toContain("setTimeout(pushIntent, 300)");
  expect(historicalSource).toContain('window.addEventListener("popstate", restore)');
  expect(historicalSource).toContain("cancelSearch();\n      setDraft(coordinator.current.restore");
  expect(historicalSource).toContain("matchingHistoricalQuestionItems(query)");
  expect(historicalSource).not.toContain('onClear={() => setSearchTerm("")}');

  const selection = await Bun.file(new URL("../../app/(admin)/admin/(eval)/questions/selection-actions.ts", import.meta.url)).text();
  for (const name of ["matchingActiveQuestionIds", "matchingHistoricalQuestionItems"]) {
    const action = selection.slice(selection.indexOf(`export async function ${name}`)).split("\n}")[0];
    expect(action.indexOf("await assertTutorOrAdmin()")).toBeGreaterThan(-1);
    expect(action.indexOf("await assertTutorOrAdmin()")).toBeLessThan(action.indexOf("await loadQuestionCourseMaps()"));
  }
});

