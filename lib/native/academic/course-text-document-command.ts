import { z } from "zod";
import { textDocumentMarkdownLimit, textDocumentSources, type TextDocumentDraft } from "@/packages/native-parity/academic/courses/text-document";
import { courseCommandReply, handleCourseCommand, validCourseCommandId, type CourseCommandAuth, type CourseCommandViewer } from "./course-command";

const fields = { source: z.enum(textDocumentSources), expectedRevision: z.string().regex(/^[a-f0-9]{64}$/) };
const withoutNul = (value: string) => !value.includes("\u0000");
const schema = z.discriminatedUnion("action", [
  z.object({ ...fields, action: z.literal("content"), title: z.string().trim().min(1).max(500).refine(withoutNul),
    markdown: z.string().max(textDocumentMarkdownLimit).refine(withoutNul), chapterId: z.string().refine(validCourseCommandId).nullable() }).strict()
    .refine(value => value.source !== "legacy-article" || value.chapterId !== null),
  z.object({ ...fields, action: z.literal("status"), status: z.enum(["draft", "published"]) }).strict(),
]);

export function handleNativeTextDocumentWrite(request: Request, slug: string, materialId: string, origin: string,
  services: CourseCommandAuth & {
    write(slug: string, id: string, draft: TextDocumentDraft, requestId: string, viewer: CourseCommandViewer): Promise<void>;
  }) {
  if (!validCourseCommandId(slug) || !validCourseCommandId(materialId)) return courseCommandReply(400, { error: "INVALID_PATH" });
  return handleCourseCommand(request, origin, services, {
    schema, maxBodyBytes: 6 * textDocumentMarkdownLimit + 4096, invalidError: "INVALID_MATERIAL",
    write: async (draft, requestId, viewer) => {
      try {
        await services.write(slug, materialId, draft, requestId, viewer);
      } catch (error) {
        if (error instanceof Error && error.message === "INVALID_TEXT_CHAPTER") throw new Error("CHAPTER_PROJECTION_UNAVAILABLE");
        throw error;
      }
    },
  });
}
