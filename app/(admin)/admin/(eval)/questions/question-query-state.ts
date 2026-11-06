export type QuestionSearchParams = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const choice = <T extends string>(value: string | undefined, values: readonly T[], fallback: T): T =>
  values.includes(value as T) ? value as T : fallback;
const integer = (value: string | undefined, fallback: number) =>
  value && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : fallback;

export const QUESTION_PAGE_SIZES = ["10", "20", "50", "100"] as const;
export const HISTORICAL_CATEGORIES = ["all", "tutorial", "quiz", "uts", "uas", "tryout", "homework", "exercise", "other"] as const;
export const QUESTION_DIFFICULTIES = ["all", "easy", "medium", "hard"] as const;

export function normalizeQuestionQuery(params: QuestionSearchParams) {
  return {
    tab: choice(first(params.tab), ["ai-generated", "historical"] as const, "ai-generated"),
    page: integer(first(params.qPage), 1),
    pageSize: choice(first(params.qPageSize), QUESTION_PAGE_SIZES, "10"),
    search: first(params.qSearch) ?? "",
    status: choice(first(params.qStatus), ["all", "generated", "reviewed", "published", "flagged", "retired"] as const, "all"),
    course: first(params.qCourse) || "all",
    origin: choice(first(params.qOrigin), ["all", "zyx_original", "itb_example"] as const, "all"),
    type: choice(first(params.qType), ["all", "multiple_choice", "multiple_choices", "short_answer", "essay"] as const, "all"),
    difficulty: choice(first(params.qDifficulty), QUESTION_DIFFICULTIES, "all"),
  };
}
export type QuestionQuery = ReturnType<typeof normalizeQuestionQuery>;

export function normalizeHistoricalQuery(params: QuestionSearchParams) {
  return {
    tab: choice(first(params.tab), ["ai-generated", "historical"] as const, "ai-generated"),
    page: integer(first(params.hPage), 1),
    pageSize: choice(first(params.hPageSize), QUESTION_PAGE_SIZES, "10"),
    search: first(params.hSearch) ?? "",
    course: first(params.hCourse) || "all",
    category: choice(first(params.hCategory), HISTORICAL_CATEGORIES, "all"),
    difficulty: choice(first(params.hDifficulty), QUESTION_DIFFICULTIES, "all"),
  };
}
export type HistoricalQuestionQuery = ReturnType<typeof normalizeHistoricalQuery>;

export type HistoricalReviewStatus = "generated" | "reviewed" | "published" | "flagged" | "retired";
export type HistoricalReviewActionStatus = "reviewed" | "published" | "flagged";

export interface HistoricalSelectionItem {
  id: string;
  reviewStatus: HistoricalReviewStatus;
  quizEligible: boolean;
}

export function historicalReviewActionFor(item: Pick<HistoricalSelectionItem, "reviewStatus" | "quizEligible">): HistoricalReviewActionStatus | null {
  if (item.reviewStatus === "generated" || item.reviewStatus === "flagged") {
    return "reviewed";
  }
  if (item.reviewStatus === "reviewed") {
    return item.quizEligible ? "published" : "flagged";
  }
  return null;
}

export function toggleQuestionIds(current: ReadonlySet<string>, ids: readonly string[]) {
  const next = new Set(current);
  const remove = ids.length > 0 && ids.every((id) => current.has(id));
  for (const id of ids) { if (remove) next.delete(id); else next.add(id); }
  return next;
}

export function toggleHistoricalQuestionEntries(
  current: ReadonlyMap<string, HistoricalSelectionItem>,
  items: readonly HistoricalSelectionItem[],
) {
  const reviewable = items.filter((item) => historicalReviewActionFor(item) !== null);
  const next = new Map(current);
  const remove = reviewable.length > 0 && reviewable.every((item) => current.has(item.id));
  for (const item of reviewable) {
    if (remove) next.delete(item.id);
    else next.set(item.id, item);
  }
  return next;
}

// Own navigations may finish after another keystroke. Only acknowledge the latest
// intent; popstate explicitly replaces it and cancels pending work.
export function createQueryCoordinator<T extends { page: number }>(initial: T) {
  let intended = initial;
  let pending = false;
  return {
    get current() { return intended; },
    change(changes: Partial<T>, resetPage = true) {
      intended = { ...intended, ...changes, ...(resetPage ? { page: 1 } : {}) };
      pending = true;
      return intended;
    },
    acknowledge(query: T) {
      if (!pending || JSON.stringify(query) === JSON.stringify(intended)) {
        intended = query;
        pending = false;
      }
      return intended;
    },
    restore(query: T) { pending = true; intended = query; return intended; },
  };
}

export function createQuestionQueryCoordinator(initial: QuestionQuery) {
  return createQueryCoordinator(initial);
}

export function createHistoricalQueryCoordinator(initial: HistoricalQuestionQuery) {
  return createQueryCoordinator(initial);
}

export function questionQueryUrl(href: string, query: QuestionQuery) {
  const url = new URL(href);
  const values = { tab: query.tab === "ai-generated" ? "" : query.tab, qPage: String(query.page), qPageSize: query.pageSize,
    qSearch: query.search, qStatus: query.status, qCourse: query.course,
    qOrigin: query.origin, qType: query.type, qDifficulty: query.difficulty };
  for (const [key, value] of Object.entries(values)) {
    if (!value || value === "all" || (key === "qPage" && value === "1")) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function historicalQueryUrl(href: string, query: HistoricalQuestionQuery) {
  const url = new URL(href);
  const values = {
    tab: query.tab === "ai-generated" ? "" : query.tab,
    hPage: String(query.page),
    hPageSize: query.pageSize,
    hSearch: query.search,
    hCourse: query.course,
    hCategory: query.category,
    hDifficulty: query.difficulty,
  };
  for (const [key, value] of Object.entries(values)) {
    if (!value || value === "all" || (key === "hPage" && value === "1")) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function clampQuestionPage(requestedPage: number, total: number, pageSize: number): { page: number; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  return { page, totalPages };
}

export function questionParamsFromUrl(params: URLSearchParams): QuestionSearchParams {
  const result: QuestionSearchParams = {};
  for (const key of new Set(params.keys())) result[key] = params.getAll(key);
  return result;
}

// Historical client search used filter(Boolean).join(" "), including JS array
// and object coercion. Keep this reference for the SQL projection parity tests.
export function questionTagSearchText(tags: unknown): string {
  return Array.isArray(tags) ? tags.filter(Boolean).join(" ") : "";
}

