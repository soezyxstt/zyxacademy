import type { QueryKey } from "@tanstack/react-query";

const root = ["zyx"] as const;
const account = (userId: string) => [...root, "account", userId] as const;
const student = (userId: string) => [...account(userId), "student"] as const;
const quizzes = (userId: string) => [...account(userId), "quizzes"] as const;
const articles = (userId: string) => [...account(userId), "articles"] as const;
const flashcards = (userId: string) => [...account(userId), "flashcards"] as const;
const admin = (userId: string) => [...account(userId), "admin"] as const;
const discussions = (userId: string) => [...account(userId), "discussions"] as const;

type Filters = Readonly<Record<string, string | number | boolean | null | undefined>>;

/** Keys describe the response owner, domain and every input that changes it. */
export const queryKeys = {
  all: root,
  account,
  public: {
    all: [...root, "public"] as const,
    pricing: () => [...root, "public", "pricing-discounts"] as const,
  },
  student: {
    all: student,
    today: (userId: string) => [...student(userId), "today"] as const,
    completeToday: (userId: string) => [...student(userId), "today", "complete"] as const,
    interventions: (userId: string) => [...student(userId), "interventions"] as const,
    enrollments: (userId: string) => [...student(userId), "enrollments"] as const,
    course: (userId: string, courseId: string) => [...student(userId), "course", courseId] as const,
    studyPaths: (userId: string) => [...student(userId), "study-path"] as const,
    studyPath: (userId: string, courseId: string, days?: number) => [...student(userId), "study-path", courseId, { days: days ?? null }] as const,
  },
  quizzes: {
    all: quizzes,
    attempt: (userId: string, attemptId: string) => [...quizzes(userId), "attempt", attemptId] as const,
    analytics: (userId: string, attemptId: string) => [...quizzes(userId), "analytics", attemptId] as const,
    submit: (userId: string, attemptId: string) => [...quizzes(userId), "submit", attemptId] as const,
  },
  articles: {
    all: articles,
    progress: (userId: string, articleId: string, version: number) => [...articles(userId), "progress", articleId, version] as const,
  },
  materials: {
    all: (userId: string) => [...account(userId), "materials"] as const,
    progress: (userId: string, materialId: string) => [...account(userId), "materials", "progress", materialId] as const,
    summary: (userId: string, chapterId: string) => [...account(userId), "materials", "summary", chapterId] as const,
  },
  flashcards: {
    all: flashcards,
    sets: (userId: string, courseId: string) => [...flashcards(userId), "sets", courseId] as const,
    due: (userId: string, courseId: string) => [...flashcards(userId), "due", courseId] as const,
  },
  discussions: {
    all: discussions,
    counts: (userId: string, courseId?: string) => [...discussions(userId), "counts", { courseId: courseId ?? null }] as const,
  },
  zyra: {
    allowance: (userId: string, courseId?: string) => [...account(userId), "zyra", "allowance", { courseId: courseId ?? null }] as const,
    proposalsAll: (userId: string) => [...account(userId), "zyra", "proposals"] as const,
    proposals: (userId: string, courseId?: string) => [...account(userId), "zyra", "proposals", { courseId: courseId ?? null }] as const,
  },
  admin: {
    all: admin,
    opsMetrics: (userId: string) => [...admin(userId), "ops-metrics"] as const,
    zyraOps: (userId: string) => [...admin(userId), "zyra-ops"] as const,
    analytics: (userId: string) => [...admin(userId), "analytics"] as const,
    usage: (userId: string, days: number) => [...admin(userId), "analytics", "usage", { days }] as const,
    keyDiagnostics: (userId: string) => [...admin(userId), "key-diagnostics"] as const,
    featureFlags: (userId: string) => [...admin(userId), "feature-flags"] as const,
    productsAll: (userId: string) => [...admin(userId), "products"] as const,
    products: (userId: string, filters: Filters) => [...admin(userId), "products", filters] as const,
    leaderboard: (userId: string, filters: Filters) => [...admin(userId), "leaderboard", filters] as const,
  },
};

export function queryAccountId(key: QueryKey): string | undefined {
  return key[0] === root[0] && key[1] === "account" && typeof key[2] === "string" ? key[2] : undefined;
}
