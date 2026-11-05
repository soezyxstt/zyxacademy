import { isFreeQuizTemplate } from "@/lib/course-utils";
import { hasChapterScopeWithin } from "@/lib/student/course-access";

type Template = Parameters<typeof isFreeQuizTemplate>[0];
type Item = { questionId: string; courseId: string; chapterId: string | null; status: string; version: number; contentVersion: number };

/** Fixed selection and canonical items must agree, including their current versions. */
export function getAuthorizedFreeQuestionIds(input: {
  template: Template;
  courseId: string;
  chapterIds: readonly string[];
  coverage: readonly string[];
  items: readonly Item[];
}): string[] {
  const { template, courseId, chapterIds, coverage, items } = input;
  if (!isFreeQuizTemplate(template, chapterIds) || !hasChapterScopeWithin(coverage, chapterIds)) return [];
  let rules: unknown = template.selectionRules;
  if (typeof rules === "string") {
    try { rules = JSON.parse(rules); } catch { return []; }
  }
  if (!rules || typeof rules !== "object" || Array.isArray(rules)) return [];
  const record = rules as Record<string, unknown>;
  const keys = ["fixedQuestionIds", "fixed_question_ids"].filter((key) => Object.prototype.hasOwnProperty.call(record, key));
  if (keys.length !== 1 || !Array.isArray(record[keys[0]])) return [];
  const ids = record[keys[0]] as unknown[];
  if (!ids.length || ids.some((id) => typeof id !== "string" || !id.trim() || id !== id.trim())) return [];
  const fixed = ids as string[];
  if (new Set(fixed).size !== fixed.length || items.length !== fixed.length) return [];
  const byId = new Map(items.map((item) => [item.questionId, item]));
  if (byId.size !== fixed.length) return [];
  if (fixed.some((id) => {
    const item = byId.get(id);
    return !item || item.courseId !== courseId || item.status !== "published"
      || item.contentVersion !== item.version || !hasChapterScopeWithin([item.chapterId], chapterIds);
  })) return [];
  return fixed;
}
