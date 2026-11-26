import { z } from "zod";
import { articleProgressResultSchema, articleProgressSchema, articleProgressUpdateSchema, type ArticleProgressUpdate } from "../../../../../lib/articles/progress-contract";
import { formativeLearnerResponseSchema, type FormativeLearnerResponse } from "../../../../../lib/materials/formative-evaluation";
import { NATIVE_STAGING_ORIGIN } from "../../../auth/session-api";
import type { StudentRequest } from "../contracts";
import { OnlineReadingError, type OnlineReadingContent } from "./online-reading";

const root = "/api/native/student/reading/learning";
const materialStatus = z.object({ materialId: z.string(), status: z.enum(["unopened", "in_progress", "completed"]) });
const checked = z.object({ ok: z.literal(true), result: z.object({
  verdict: z.enum(["correct", "partial", "incorrect", "ungradable"]),
  feedback: z.string(), canRetry: z.boolean(), revealAllowed: z.boolean(),
  criteria: z.array(z.object({ criterionId: z.string(), status: z.enum(["met", "partial", "missed"]) })).optional(),
  misconceptions: z.array(z.string()).optional(),
}) });
const revealed = z.object({
  answer: z.string(), explanation: z.string(),
  visualAccess: z.object({ answer: z.string().optional(), explanation: z.string().optional() }).optional(),
});
export type CheckReveal = z.infer<typeof revealed>;
export type ReadProgress = z.infer<typeof articleProgressSchema> | z.infer<typeof materialStatus>;
export type CheckResult = z.infer<typeof checked>["result"];
const publicCheck = z.object({
  checkKind: z.enum(["multiple_choice", "short_answer", "numeric_answer", "conceptual_explanation"]),
  evaluationMode: z.enum(["choice", "text_exact", "numeric", "ai_rubric"]).nullable(),
  unit: z.string().optional(),
  options: z.array(z.object({ id: z.string(), text: z.string() })).optional(),
  feedbackPolicy: z.object({ hints: z.array(z.string()), allowRetry: z.boolean() }).optional(),
});
export type StudyBlock = { id: string; title: string | null; content: string; formativeCheck: z.infer<typeof publicCheck> };
export type StudySection = { id: string; slug: string; checks: StudyBlock[] };

export function readingStudySections(content: OnlineReadingContent): StudySection[] {
  if (!content.structured || !("sections" in content.data)) return [];
  return content.data.sections.map(section => ({
    id: section.id,
    slug: section.slug,
    checks: section.blocks.flatMap(block => {
      const parsed = publicCheck.safeParse(block.formativeCheck);
      return parsed.success ? [{ id: block.id, content: block.content, title: typeof block.title === "string" ? block.title : null,
        formativeCheck: parsed.data }] : [];
    }),
  }));
}

export function readingLearning(request: StudentRequest, courseId: string, content: OnlineReadingContent) {
  const materialId = content.data.id;
  const scope = { courseId, materialId, revision: content.revision };
  const articleVersion = "version" in content.data ? content.data.version : null;
  async function result<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal, body?: object) {
    const response = await request(path, body ? {
      method: "POST", body: JSON.stringify({ ...scope, ...body }), signal,
      headers: { "Content-Type": "application/json", Origin: NATIVE_STAGING_ORIGIN },
    } : { method: "GET", signal });
    try {
      if (!response.ok) throw new OnlineReadingError(response.status);
      const parsed = schema.safeParse(await response.json());
      if (!parsed.success) throw new OnlineReadingError(502);
      return parsed.data;
    } finally {
      response.dispose?.();
    }
  }
  return {
    progress(signal: AbortSignal): Promise<ReadProgress> {
      const path = root + "?" + new URLSearchParams(scope);
      return content.structured && articleVersion
        ? result(path, articleProgressSchema.extend({ articleId: z.literal(materialId), articleVersion: z.literal(articleVersion) }), signal)
        : result(path, materialStatus.extend({ materialId: z.literal(materialId) }), signal);
    },
    save(input: ArticleProgressUpdate, signal?: AbortSignal) {
      if (!articleVersion) throw new OnlineReadingError(404);
      return result(root, articleProgressResultSchema.extend({
        articleId: z.literal(materialId), articleVersion: z.literal(articleVersion), sectionId: z.literal(input.sectionId),
      }), signal, { action: "article-progress", progress: articleProgressUpdateSchema.parse({ ...input, articleVersion }) });
    },
    setStatus(status: "in_progress" | "completed", signal: AbortSignal) {
      return result(root, z.object({ success: z.literal(true) }), signal, { action: "status", status });
    },
    evaluate(sectionId: string, blockId: string, response: FormativeLearnerResponse, signal: AbortSignal) {
      return result(root, checked, signal, { action: "evaluate", sectionId, blockId, response: formativeLearnerResponseSchema.parse(response) });
    },
    reveal(sectionId: string, blockId: string, signal: AbortSignal) {
      return result(root, revealed, signal, { action: "reveal", sectionId, blockId });
    },
  };
}

export function resumeReadingSection(progress: ReadProgress, sections: ReadonlyArray<{ id: string; slug: string }>, requested?: string) {
  const requestedSection = sections.find(section => section.id === requested || section.slug === requested);
  if (requestedSection) return requestedSection;
  if (!("sectionProgress" in progress)) return sections[0];
  let latest = 0;
  let result = sections[0];
  for (const section of sections) {
    const visited = Date.parse(progress.sectionProgress[section.id]?.lastReadAt ?? "");
    if (visited > latest) { latest = visited; result = section; }
  }
  return result;
}
