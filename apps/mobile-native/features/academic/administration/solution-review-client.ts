import { z } from "zod";
import { solutionCollectionSchema, type SolutionCollection } from "../../../../../lib/materials/solution-collection";
import { solutionItemDecisionSchema } from "../../../../../packages/academic/solution-review-decisions";
import type { ReviewContext } from "../../../../../packages/academic/solution-review-state";
import type { AcademicTransport } from "../client";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const decision = z.enum(["approved", "rejected"]);
const contextSchema = z.object({ result: z.object({
  reviewerId: z.string().min(1),
  revision: hash,
  reviewVersion: hash,
  productId: z.string().min(1),
  collection: solutionCollectionSchema,
  itemHashes: z.array(z.object({ itemId: z.string().min(1), itemHash: hash })).min(1).max(500),
  savedReview: z.object({ decision, items: z.array(solutionItemDecisionSchema).min(1).max(500) }).nullable(),
}) });
const receiptSchema = z.object({ result: z.object({ revision: hash, reviewVersion: hash, decision, reviewId: z.string().min(1), created: z.boolean() }) });
type SolutionContext = z.infer<typeof contextSchema>["result"];
export type SolutionReviewPayload = { expectedRevision: string; expectedReviewVersion: string;
  decision: "approved" | "rejected"; items: z.infer<typeof solutionItemDecisionSchema>[] };
export type SolutionReviewAttempt = { requestId: string; payload: SolutionReviewPayload };

const solutionReviewPath = (importId: string) => `/api/admin/bundles/product/${encodeURIComponent(importId)}/solution-review`;
const safeSegment = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,159}$/;

export function solutionReviewWebPath(courseId: string, importId: string) {
  if (!safeSegment.test(courseId) || !safeSegment.test(importId)) return null;
  return `/admin/courses/${encodeURIComponent(courseId)}/review/product/${encodeURIComponent(importId)}`;
}

export class SolutionReviewFailure extends Error {
  constructor(readonly status: number) { super("Solution review unavailable"); }
}

export async function readSolutionReview(transport: AcademicTransport, importId: string, checksum: string,
  collection: SolutionCollection, signal: AbortSignal): Promise<SolutionContext> {
  const query = new URLSearchParams({ expectedRevision: checksum });
  const response = await transport.get(`${solutionReviewPath(importId)}?${query}`, signal);
  if (!response.ok) throw new SolutionReviewFailure(response.status);
  const parsed = contextSchema.safeParse(await response.json());
  if (!parsed.success) throw new SolutionReviewFailure(422);
  const { result } = parsed.data;
  const hashes = new Map(result.itemHashes.map(entry => [entry.itemId, entry.itemHash]));
  const saved = new Map(result.savedReview?.items.map(entry => [entry.itemId, entry.itemHash]));
  if (result.reviewerId !== transport.accountId || result.revision !== checksum || result.productId !== collection.id ||
    result.collection.course.id !== collection.course.id || result.collection.chapter.id !== collection.chapter.id ||
    result.collection.id !== collection.id || result.collection.items.length !== collection.items.length ||
    result.itemHashes.length !== collection.items.length || hashes.size !== collection.items.length ||
    collection.items.some((item, index) => !hashes.has(item.id) || result.collection.items[index].id !== item.id) ||
    (result.savedReview && (saved.size !== hashes.size || result.savedReview.items.length !== hashes.size ||
      [...hashes].some(([id, itemHash]) => saved.get(id) !== itemHash)))) throw new SolutionReviewFailure(409);
  return result;
}

export async function saveSolutionReview(transport: AcademicTransport, importId: string, attempt: SolutionReviewAttempt, signal: AbortSignal) {
  if (!transport.command) return { status: "denied" } as const;
  const response = await transport.command(solutionReviewPath(importId), { method: "POST", body: attempt.payload, requestId: attempt.requestId }, signal);
  if ([401, 403, 404].includes(response.status)) return { status: "denied" } as const;
  if (response.status === 409) return { status: "stale" } as const;
  if ([400, 422].includes(response.status)) return { status: "invalid" } as const;
  if (!response.ok) return { status: "uncertain" } as const;
  const receipt = receiptSchema.safeParse(await response.json().catch(() => null));
  if (!receipt.success || receipt.data.result.revision !== attempt.payload.expectedRevision ||
    receipt.data.result.decision !== attempt.payload.decision) return { status: "uncertain" } as const;
  return { status: "saved", reviewVersion: receipt.data.result.reviewVersion } as const;
}

export function solutionReviewCanPublish(
  context: ReviewContext | null,
  review: { approved: boolean } | null,
  state: { dirty: boolean; busy: boolean; pending: boolean; conflict: boolean },
) {
  return context?.savedReview?.decision === "approved" && review?.approved === true &&
    !state.dirty && !state.busy && !state.pending && !state.conflict;
}
