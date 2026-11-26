import { personalAccountSessionHeader } from "../../packages/student-community/account-access";
import { z } from "zod";
import { articlePartsSchema, flattenArticleParts, type ArticlePart } from "../materials/article-parts";

export const nativeArticleCodingHeader = "x-native-article-coding";
export const nativeArticleCodingScope = z.object({
  materialId: z.string().min(1).max(160),
  sectionId: z.string().min(1).max(240),
  partId: z.string().min(1).max(160),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export type NativeArticleCodingScope = z.infer<typeof nativeArticleCodingScope>;
export function nativeArticleCodingHeaders(scope: NativeArticleCodingScope, sessionId: string) {
  return {
    [nativeArticleCodingHeader]: encodeURIComponent(JSON.stringify(scope)),
    [personalAccountSessionHeader]: sessionId,
  };
}

type CodingPart = Extract<ArticlePart, { kind: "code_example" | "coding_exercise" }>;

export function sectionCodingParts(blocks: readonly ({ id: string; parts?: unknown; title?: unknown })[]) {
  const entries = new Map<string, { part: CodingPart; title?: string } | null>();
  for (const block of blocks) {
    if (block.parts === undefined) continue;
    const parsed = articlePartsSchema.safeParse(block.parts);
    if (!parsed.success) continue;
    for (const part of flattenArticleParts(parsed.data)) {
      if (part.kind !== "coding_exercise" && (part.kind !== "code_example" || !part.runnable)) continue;
      entries.set(part.id, entries.has(part.id) ? null : { part, title: typeof block.title === "string" ? block.title : undefined });
    }
  }
  return [...entries.values()].filter(entry => entry !== null);
}

export function articleCodingDraftKey(articleId: string, version: number, part: CodingPart) {
  return [part.kind === "code_example" ? "example" : "exercise", articleId, version, part.id].join(":");
}
