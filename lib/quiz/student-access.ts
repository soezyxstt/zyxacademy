import type { quizTemplates } from "@/db/schema";
import { isFreeQuizTemplate, parseQuizSelectionRules } from "@/lib/course-utils";
import { hasChapterScopeWithin } from "@/lib/student/course-access";
import type { CourseAccessResult } from "@/lib/student/course-access";

export function canAccessStudentQuizTemplate(access: CourseAccessResult, template: Pick<typeof quizTemplates.$inferSelect, "status" | "category" | "visibility" | "selectionRules">): boolean {
  if (!access.hasCourseAccess) return false;
  if (access.tier === "staff") return true;
  if (template.status !== "published") return false;
  if (access.tier === "free" && access.hasFullContentAccess) {
    const rules = parseQuizSelectionRules(template.selectionRules);
    const scopes = ["chapterId", "chapterIds", "chapters", "chapter_ids"].filter((key) => Object.prototype.hasOwnProperty.call(rules, key));
    if (scopes.length > 1) return false;
    if (scopes.length === 1) {
      const raw = rules[scopes[0]];
      const ids = typeof raw === "string" ? [raw] : Array.isArray(raw) ? raw : [];
      if (!ids.every((id): id is string => typeof id === "string") || !hasChapterScopeWithin(ids, access.scopedChapterIds)) return false;
    }
    return true;
  }
  return (access.hasFullContentAccess ?? (access.tier === "enrolled")) || (access.tier === "free" && isFreeQuizTemplate(template, access.freeChapterIds));
}
