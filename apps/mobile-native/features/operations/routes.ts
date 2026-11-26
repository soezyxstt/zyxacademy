/** Canonical web route patterns owned by operations, grouped by native entry. */
export const operationsPatterns = {
  evaluation: [
    "/admin/assessments",
    "/admin/assessments/[id]",
    "/admin/ast-inspector",
    "/admin/diktats",
    "/admin/distractors",
    "/admin/jobs",
    "/admin/leaderboard",
    "/admin/questions",
    "/admin/quiz-insights",
    "/admin/quiz-insights/[id]",
    "/admin/quizzes",
    "/admin/quizzes/[id]/edit",
    "/admin/quizzes/new",
  ],
  management: [
    "/admin/blog",
    "/admin/blog/[id]/edit",
    "/admin/blog/new",
    "/admin/discussions",
    "/admin/docs",
    "/admin/docs/[slug]",
    "/admin/forms",
    "/admin/forms/[id]",
    "/admin/media",
    "/admin/meet",
    "/admin/meet/[id]",
    "/admin/pricing",
    "/admin/tautan",
  ],
  monitoring: [
    "/admin",
    "/admin/ops",
    "/admin/ops/analytics",
    "/admin/ops/feature-usage",
    "/admin/ops/keys",
    "/admin/ops/models",
    "/admin/ops/offline",
    "/admin/ops/short-links",
    "/admin/ops/tutor-activity",
    "/admin/ops/web-analytics",
  ],
  public: [
    "/",
    "/about",
    "/blog",
    "/blog/[slug]",
    "/demo",
    "/demo/[view]",
    "/download",
    "/forms-playground",
    "/plans",
    "/privacy",
    "/terms",
    "/testimonial",
    "/unsubscribe",
  ],
} as const;

export type OperationsArea = keyof typeof operationsPatterns;

function hasValidSegments(path: string): boolean {
  try {
    return path.split("/").every(part => {
      const decoded = decodeURIComponent(part);
      return decoded !== "." && decoded !== ".." && !/[/\\\x00-\x1f]/.test(decoded);
    });
  } catch {
    return false;
  }
}

export function resolveOperationsArea(href: string): OperationsArea | null {
  const path = href.split(/[?#]/, 1)[0].replace(/\/$/, "");
  if (!href.startsWith("/") || href.startsWith("//") || !hasValidSegments(path)) return null;
  const segments = path.split("/");
  for (const [area, patterns] of Object.entries(operationsPatterns)) {
    for (const pattern of patterns) {
      const parts = (pattern === "/" ? "" : pattern).split("/");
      if (parts.length === segments.length && parts.every((part, i) =>
        part.startsWith("[") ? Boolean(segments[i]) : part === segments[i]
      )) return area as OperationsArea;
    }
  }
  return null;
}
