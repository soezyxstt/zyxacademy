import { z } from "zod";
import { coursePath } from "../../../../../packages/native-parity/student/courses/contract";
import type { StudentRequest } from "../contracts";
import { OnlineReadingError } from "./online-reading";

const snippet = z.object({ title: z.string(), content: z.string() });
const concept = z.object({
  conceptName: z.string().min(1),
  mastery: z.object({ score: z.number(), trend: z.enum(["improving", "stable", "declining"]).nullable() }),
  quickExplain: snippet.nullable(),
  analogy: z.string().nullable(),
  example: snippet.nullable(),
  commonMistake: snippet.nullable(),
  reviewHref: z.string(),
});
export type ReadingTerm = z.infer<typeof concept>;
const lookupResult = z.object({ concept: concept.nullable() });

export async function lookupReadingTerm(request: StudentRequest, target: {
  courseId: string; materialId: string; revision: string; selection: string;
}, origin: string, signal: AbortSignal) {
  const response = await request("/api/native/student/reading", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(target), signal,
  });
  try {
    if (!response.ok) throw new OnlineReadingError(response.status);
    const parsed = lookupResult.safeParse(await response.json());
    if (!parsed.success) throw new OnlineReadingError(502);
    return parsed.data.concept;
  } finally { response.dispose?.(); }
}

/** Review destinations are constrained to the admitted course and local material routes. */
export function readingTermReviewPath(courseId: string, reviewHref: string) {
  const root = coursePath(courseId);
  if (root === reviewHref) return root;
  const prefix = root + "/material/";
  if (!reviewHref.startsWith(prefix)) return root;
  try {
    const material = decodeURIComponent(reviewHref.slice(prefix.length));
    return material && material !== "." && material !== ".." && !/[\\/?#\s\u0000-\u001f\u007f]/u.test(material)
      ? prefix + encodeURIComponent(material) : root;
  } catch { return root; }
}
