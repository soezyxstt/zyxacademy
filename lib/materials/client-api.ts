import { z } from "zod";
import { requestJson } from "@/lib/query/http";
import {
  chapterSummaryResultSchema,
  materialProgressInputSchema,
  materialProgressResultSchema,
  type MaterialProgressInput,
} from "./client-contracts";

export function saveMaterialReadingProgress(studentId: string, input: MaterialProgressInput) {
  const body = materialProgressInputSchema.parse(input);
  return requestJson("/api/student/material-progress", materialProgressResultSchema.extend({
    studentId: z.literal(studentId), materialId: z.literal(body.materialId),
  }), {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-student-id": studentId },
    body: JSON.stringify(body),
    keepalive: true,
  });
}

export function generateChapterSummary(studentId: string, chapterId: string) {
  return requestJson("/api/student/summarize-chapter", chapterSummaryResultSchema, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-student-id": studentId },
    body: JSON.stringify({ chapterId: z.string().min(1).parse(chapterId) }),
  });
}
