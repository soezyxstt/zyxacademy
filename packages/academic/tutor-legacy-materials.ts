import { z } from "zod";

export const tutorLegacyMaterialBodyBytes = 1024 * 1024;
const materialId = z.string().min(1).max(256).regex(/^[^/\\\u0000-\u001f]+$/u);
const revision = z.string().regex(/^[a-f0-9]{64}$/);
const requiredText = z.string().min(1).max(tutorLegacyMaterialBodyBytes).refine(text => Boolean(text.trim()) && !text.includes("\0"));
const materialText = { title: requiredText, summary: requiredText, markdown: requiredText };
export const tutorLegacyMaterialCommand = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("create"), ...materialText }),
  z.strictObject({ action: z.literal("edit"), id: materialId, expectedRevision: revision, ...materialText }),
  z.strictObject({ action: z.literal("delete"), id: materialId, expectedRevision: revision }),
]);
export const tutorLegacyMaterialDraft = z.object({
  id: materialId, courseId: materialId, revision, title: z.string(), summary: z.string(), markdown: z.string(),
});

export type TutorLegacyMaterialCommand = z.infer<typeof tutorLegacyMaterialCommand>;
export type TutorLegacyMaterialDraft = z.infer<typeof tutorLegacyMaterialDraft>;
export type LegacyMaterialSection = { title: string | null; orderIndex: number; chunks: { chunkText: string; orderIndex: number }[] };

export function reconstructLegacyMaterialMarkdown(sections: readonly LegacyMaterialSection[]) {
  return sections.map(section => (section.title ? `## ${section.title}\n\n` : "") + section.chunks.map(chunk => chunk.chunkText).join("\n\n"))
    .join("\n\n");
}

export function tutorLegacyMaterialsPath(courseId: string) {
  return `/api/native/academic/tutor-support/courses/${encodeURIComponent(courseId)}/materials/legacy`;
}
