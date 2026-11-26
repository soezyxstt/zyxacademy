export const evaluationRoutes = [
  { id: "assessment-detail", path: "/admin/assessments/[id]", kind: "alias" },
  { id: "assessments", path: "/admin/assessments", kind: "alias" },
  { id: "ast-inspector", path: "/admin/ast-inspector", kind: "screen" },
  { id: "diktats", path: "/admin/diktats", kind: "alias" },
  { id: "distractors", path: "/admin/distractors", kind: "screen" },
  { id: "jobs", path: "/admin/jobs", kind: "screen" },
  { id: "leaderboard", path: "/admin/leaderboard", kind: "alias" },
  { id: "questions", path: "/admin/questions", kind: "screen" },
  { id: "quiz-insight", path: "/admin/quiz-insights/[id]", kind: "alias" },
  { id: "quiz-insights", path: "/admin/quiz-insights", kind: "alias" },
  { id: "quiz-edit", path: "/admin/quizzes/[id]/edit", kind: "alias" },
  { id: "quiz-new", path: "/admin/quizzes/new", kind: "alias" },
  { id: "quizzes", path: "/admin/quizzes", kind: "alias" },
] as const;

export type EvaluationRoute = (typeof evaluationRoutes)[number];
export type Alias = Extract<EvaluationRoute, { kind: "alias" }>["id"];
export type EvaluationMatch = {
  route: EvaluationRoute;
  id?: string;
  search: URLSearchParams;
};

export function matchEvaluationRoute(href: string): EvaluationMatch | undefined {
  if (!href.startsWith("/admin/")) return;
  const url = new URL(href, "https://local.invalid");
  const parts = url.pathname.replace(/\/$/, "").split("/");
  for (const route of evaluationRoutes) {
    const pattern = route.path.split("/");
    if (pattern.length !== parts.length || !pattern.every((part, index) => part === "[id]" || part === parts[index])) continue;
    const index = pattern.indexOf("[id]");
    const rawId = index === -1 ? undefined : parts[index];
    if (!rawId) return { route, search: url.searchParams };
    try {
      return { route, id: decodeURIComponent(rawId), search: url.searchParams };
    } catch {
      return;
    }
  }
}

export type EvaluationRedirect = { kind: "redirect"; href: string } | { kind: "not-found" };

type ResolveAlias = {
  course: (id: string) => Promise<string | null>;
  quiz: (id: string) => Promise<string | null>;
};

export async function resolveEvaluationAlias(
  route: Alias,
  id: string | undefined,
  search: URLSearchParams,
  resolve: ResolveAlias,
): Promise<EvaluationRedirect> {
  const redirect = (href: string): EvaluationRedirect => ({ kind: "redirect", href });
  if (route === "assessments" || route === "assessment-detail") return redirect("/admin/questions");
  if (route === "diktats") return redirect("/admin/materials/review?section=product");
  if (route === "quiz-insight" || route === "quiz-edit") {
    if (!id) return redirect("/admin/courses");
    const course = await resolve.quiz(id);
    if (!course) return { kind: "not-found" };
    const root = `/admin/courses/${encodeURIComponent(course)}`;
    const quiz = encodeURIComponent(id);
    return redirect(route === "quiz-insight" ? `${root}/analytics/${quiz}` : `${root}/quizzes/${quiz}/edit`);
  }
  const courseId = search.get("courseId");
  const candidate = route === "quiz-new" ? (courseId || search.get("courseSlug") || "").trim() : courseId;
  const course = candidate ? await resolve.course(candidate) : null;
  if (!course) return redirect("/admin/courses");
  const root = `/admin/courses/${encodeURIComponent(course)}`;
  const tags = search.get("tags");
  switch (route) {
    case "leaderboard": return redirect(`${root}/leaderboard`);
    case "quiz-insights": return redirect(`${root}/analytics`);
    case "quizzes": return redirect(`${root}/quizzes`);
    case "quiz-new": return redirect(`${root}/quizzes/new${tags ? `?tags=${encodeURIComponent(tags)}` : ""}`);
  }
}
