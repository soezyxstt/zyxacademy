/** Browser cache identity. Server authorization is always enforced independently. */
const root = ["zyx", "v1"] as const;
const account = (userId: string | null) => [...root, "account", userId] as const;
const student = (userId: string | null) => [...account(userId), "student"] as const;
const admin = (userId: string | null) => [...account(userId), "admin"] as const;

export const queryKeys = {
  all: root,
  account,
  pricing: () => [...root, "public", "pricing"] as const,
  student,
  today: (userId: string | null) => [...student(userId), "today"] as const,
  studyPathRoot: (userId: string | null) => [...student(userId), "study-path"] as const,
  studyPaths: (userId: string | null, courseId: string) => [...student(userId), "study-path", courseId] as const,
  studyPath: (userId: string | null, courseId: string, days: number | null) => [...student(userId), "study-path", courseId, { days }] as const,
  articleProgress: (userId: string | null, articleId: string, version: number) => [...student(userId), "article-progress", articleId, version] as const,
  attempt: (userId: string | null, attemptId: string) => [...student(userId), "quiz-attempt", attemptId] as const,
  discussions: (userId: string | null) => [...account(userId), "discussions"] as const,
  discussionCounts: (userId: string | null, courseId?: string) => [...account(userId), "discussions", "counts", { courseId: courseId ?? null }] as const,
  allowance: (userId: string | null, courseId?: string | null) => [...account(userId), "zyra", "allowance", { courseId: courseId ?? null }] as const,
  admin,
  ops: (userId: string | null) => [...admin(userId), "ops"] as const,
  diagnostics: (userId: string | null) => [...admin(userId), "key-diagnostics"] as const,
  flags: (userId: string | null) => [...admin(userId), "feature-flags"] as const,
  analytics: (userId: string | null) => [...admin(userId), "ai-analytics"] as const,
  usage: (userId: string | null, days: "7" | "30" | "90") => [...admin(userId), "ai-analytics", "usage", { days }] as const,
};
