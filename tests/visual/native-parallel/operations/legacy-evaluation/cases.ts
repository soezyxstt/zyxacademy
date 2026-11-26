type AliasCase = {
  id: string;
  href: string;
} & ({ expected: 307; destination: string } | { expected: 404 });

export const legacyEvaluationCases: readonly AliasCase[] = [
  { id: "assessments", href: "/admin/assessments", expected: 307, destination: "/admin/questions" },
  { id: "assessment-detail", href: "/admin/assessments/asesmen-lama", expected: 307, destination: "/admin/questions" },
  { id: "diktats", href: "/admin/diktats", expected: 307, destination: "/admin/materials/review?section=product" },
  { id: "leaderboard-known", href: "/admin/leaderboard?courseId=mekanika-legacy", expected: 307, destination: "/admin/courses/mekanika-dasar/leaderboard" },
  { id: "leaderboard-unknown", href: "/admin/leaderboard?courseId=unknown", expected: 307, destination: "/admin/courses" },
  { id: "leaderboard-missing", href: "/admin/leaderboard", expected: 307, destination: "/admin/courses" },
  { id: "insights-known", href: "/admin/quiz-insights?courseId=mekanika-legacy", expected: 307, destination: "/admin/courses/mekanika-dasar/analytics" },
  { id: "insights-unknown", href: "/admin/quiz-insights?courseId=unknown", expected: 307, destination: "/admin/courses" },
  { id: "insight-known", href: "/admin/quiz-insights/kuis-energi", expected: 307, destination: "/admin/courses/mekanika-dasar/analytics/kuis-energi" },
  { id: "insight-unknown", href: "/admin/quiz-insights/kuis-tidak-ada", expected: 404 },
  { id: "quizzes-known", href: "/admin/quizzes?courseId=mekanika-legacy&tags=ignored", expected: 307, destination: "/admin/courses/mekanika-dasar/quizzes" },
  { id: "quizzes-unknown", href: "/admin/quizzes?courseId=unknown", expected: 307, destination: "/admin/courses" },
  { id: "quiz-new-tags", href: "/admin/quizzes/new?courseSlug=mekanika-legacy&tags=panas%2Fdalam%2Cenergi", expected: 307, destination: "/admin/courses/mekanika-dasar/quizzes/new?tags=panas%2Fdalam%2Cenergi" },
  { id: "quiz-new-course-priority", href: "/admin/quizzes/new?courseId=unknown&courseSlug=mekanika-legacy", expected: 307, destination: "/admin/courses" },
  { id: "quiz-new-missing", href: "/admin/quizzes/new", expected: 307, destination: "/admin/courses" },
  { id: "quiz-edit-known", href: "/admin/quizzes/kuis-energi/edit?courseId=other&returnUrl=%2Fexternal", expected: 307, destination: "/admin/courses/mekanika-dasar/quizzes/kuis-energi/edit" },
  { id: "quiz-edit-unknown", href: "/admin/quizzes/kuis-tidak-ada/edit", expected: 404 },
];

const browserIds = new Set([
  "assessments", "assessment-detail", "diktats", "leaderboard-known", "insights-known",
  "insight-unknown", "quizzes-known", "quiz-new-tags", "quiz-edit-known",
]);

export const legacyEvaluationBrowserCases = legacyEvaluationCases.filter((entry) => browserIds.has(entry.id));
