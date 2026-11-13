import type { quizTemplates } from "@/db/schema";
import { isFreeQuizTemplate } from "@/lib/course-utils";
import { hasChapterScopeWithin } from "@/lib/student/course-access";
import type { CourseAccessResult } from "@/lib/student/course-access";

/** Returns null for invalid rules, an empty array for a valid course-wide quiz. */
export function validatedQuizScope(raw: unknown): string[] | null {
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch { return null; }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.getPrototypeOf(raw) !== Object.prototype) return null;
  const rules = raw as Record<string, unknown>;
  const keys = ["chapterId", "chapterIds", "chapters", "chapter_ids"].filter((key) => Object.hasOwn(rules, key));
  if (keys.length > 1) return null;
  for (const names of [["fixedQuestionIds", "fixed_question_ids", "questionIds", "question_ids"], ["tags"]]) {
    const present = names.filter((key) => Object.hasOwn(rules, key));
    if (present.length > 1) return null;
    if (present.length) {
      const value = rules[present[0]];
      if (!Array.isArray(value) || value.some((id) => typeof id !== "string" || !id.trim()) || new Set(value).size !== value.length) return null;
    }
  }
  if (!keys.length) return [];
  const rawScope = rules[keys[0]];
  // Authoring emits chapterIds: [] for a course-wide quiz.
  if (keys[0] === "chapterIds" && Array.isArray(rawScope) && rawScope.length === 0) return [];
  const values = typeof rawScope === "string" ? [rawScope] : rawScope;
  if (!Array.isArray(values) || !values.length || values.some((id) => typeof id !== "string" || !id.trim())) return null;
  return values.map((id: string) => id.trim());
}

export function canAccessStudentQuizTemplate(access: CourseAccessResult, template: Pick<typeof quizTemplates.$inferSelect, "status" | "category" | "visibility" | "selectionRules">): boolean {
  if (!access.hasCourseAccess) return false;
  const scope = validatedQuizScope(template.selectionRules);
  if (!scope) return false;
  if (access.tier === "staff") return true;
  if (template.status !== "published") return false;
  if (access.tier === "free" && access.hasFullContentAccess) {
    if (scope.length && !hasChapterScopeWithin(scope, access.scopedChapterIds)) return false;
    return true;
  }
  return (access.hasFullContentAccess ?? (access.tier === "enrolled")) || (access.tier === "free" && isFreeQuizTemplate(template, access.freeChapterIds));
}
