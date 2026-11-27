import { z } from "zod";
import { ideaInstructionalRoleSchema, ideaKnowledgeKindSchema } from "../../../../../lib/ide/contracts";
import type { LiveIdeaBundle } from "../../../../../packages/native-parity/academic/administration/live";
import type { AcademicCommand, AcademicTransport } from "../client";

const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const decision = z.enum(["approved", "rejected"]);
const editableIdea = z.object({
  id: z.string().min(1), code: z.string(), canonicalStatement: z.string(), conciseExplanation: z.string(),
  latex: z.string().nullish(), knowledgeKind: ideaKnowledgeKindSchema, instructionalRole: ideaInstructionalRoleSchema,
}).passthrough();
const entity = z.object({ id: z.string().min(1) }).passthrough();
const draftSchema = z.object({ ideas: z.array(editableIdea), provenance: z.array(entity),
  relations: z.array(entity), learningSections: z.array(entity) }).passthrough();
const previewIdea = z.object({
  id: z.string(), code: z.string(), chapterId: z.string(), canonicalStatement: z.string(), conciseExplanation: z.string(),
  latex: z.string().nullable(), knowledgeKind: z.string(), instructionalRole: z.string(),
  learningSection: z.object({ title: z.string() }).nullable(),
  provenance: z.array(z.object({
    id: z.string(), role: z.string(), sourceTitle: z.string(), excerpt: z.string(), sectionLocator: z.string().nullable(),
    pageNumber: z.number().nullable(), note: z.string().nullable(),
  })),
});
const resetSchema = z.object({
  revision: checksum, fingerprint: checksum, itemReviewCount: z.number().int().nonnegative(), bundleReviewCount: z.number().int().nonnegative(),
});
const snapshotSchema = z.object({
  reviewerId: z.string().min(1),
  bundle: z.object({
    id: z.string().min(1), bundleId: z.string().min(1), courseId: z.string().min(1), checksum,
    status: z.enum(["received", "validated", "approved", "rejected", "draft", "published", "withdrawn", "discarding"]),
    currentReview: z.object({ reviewerId: z.string(), status: z.enum(["pending", "approved", "rejected"]), notes: z.string().nullable(), revisionBound: z.boolean() }).nullable(),
  }),
  draft: draftSchema,
  preview: z.object({
    ideas: z.array(previewIdea),
    relations: z.array(z.object({ id: z.string(), sourceIdeaId: z.string(), targetIdeaId: z.string(),
      relationType: z.string(), explanation: z.string().nullable() })),
    learningSections: z.array(z.object({ id: z.string(), title: z.string(), learningObjective: z.string(), orderIndex: z.number(),
      parentSectionId: z.string().nullable(), primaryIdeaIds: z.array(z.string()), supportingIdeaIds: z.array(z.string()) })),
  }),
  itemReviews: z.array(z.object({ reviewerId: z.string(), imporBundleId: z.string(), targetId: z.string(), productId: z.null(), status: z.enum(["pending", "approved", "changes_requested"]), notes: z.string().nullable() })),
  reviewReset: resetSchema,
});

export type IdeaBundleData = z.infer<typeof snapshotSchema>;
export type IdeaDraft = z.infer<typeof draftSchema>;
export type IdeaDraftFields = Pick<z.infer<typeof editableIdea>, "code" | "canonicalStatement" | "conciseExplanation" | "latex" | "knowledgeKind" | "instructionalRole">;
export type IdeaDecision = z.infer<typeof decision>;
export type IdeaBundleAction = "review" | "publish" | "withdraw" | "discard" | "edit";
export type IdeaCommand = { action: IdeaBundleAction; suffix: string; method: AcademicCommand["method"]; body: object; label: string };

export class IdeaBundleRequestError extends Error {
  constructor(readonly status: number) { super("Idea Bundle request failed"); }
}
export const ideaBundlePath = (id: string) => "/api/admin/bundles/idea/" + encodeURIComponent(id);
export function validateIdeaBundleSnapshot(value: unknown, scope: LiveIdeaBundle, actorId: string): IdeaBundleData {
  const parsed = snapshotSchema.safeParse(value);
  if (!parsed.success) throw new IdeaBundleRequestError(502);
  const data = parsed.data;
  if (data.bundle.id !== scope.id || data.bundle.courseId !== scope.courseId) throw new IdeaBundleRequestError(404);
  if (data.reviewerId !== actorId || (data.bundle.currentReview && data.bundle.currentReview.reviewerId !== actorId) || data.itemReviews.some(item => item.reviewerId !== actorId || item.imporBundleId !== scope.id)) throw new IdeaBundleRequestError(403);
  if (data.bundle.checksum !== scope.checksum || data.reviewReset.revision !== scope.checksum) throw new IdeaBundleRequestError(409);
  return data;
}
export async function readIdeaBundle(transport: AcademicTransport, scope: LiveIdeaBundle, signal: AbortSignal) {
  const response = await transport.get(ideaBundlePath(scope.id), signal);
  if (!response.ok) throw new IdeaBundleRequestError(response.status);
  return validateIdeaBundleSnapshot(await response.json(), scope, transport.accountId);
}
export function ideaBundleControls(data: IdeaBundleData) {
  const editable = ["validated", "approved", "rejected"].includes(data.bundle.status);
  const own = data.bundle.currentReview?.status === "pending" ? null : data.bundle.currentReview;
  const states = new Map(data.itemReviews.map(item => [item.targetId, item.status]));
  const total = data.preview.ideas.length;
  const approved = data.preview.ideas.filter(idea => states.get(idea.id) === "approved").length;
  const reviewed = data.preview.ideas.filter(idea => states.has(idea.id) && states.get(idea.id) !== "pending").length;
  return {
    editable, reviewed, total, approve: editable && total > 0 && approved === total && !own?.revisionBound && (!own || own.status === "approved"),
    reject: editable && total > 0 && reviewed === total && !own?.revisionBound && (!own || own.status === "rejected"),
    publish: editable && own?.status === "approved" && own.revisionBound,
    withdraw: data.bundle.status === "published",
    discard: editable || data.bundle.status === "discarding",
  };
}
export function patchIdeaDraft(draft: IdeaDraft, id: string, fields: IdeaDraftFields): IdeaDraft {
  return { ...draft, ideas: draft.ideas.map(idea => idea.id === id ? { ...idea, ...fields } : idea) };
}
export function ideaEditCommand(data: IdeaBundleData, draft: IdeaDraft): IdeaCommand {
  return { action: "edit", suffix: "", method: "PUT", label: "Simpan perubahan",
    body: { draft, expectedRevision: data.bundle.checksum, reviewResetFingerprint: data.reviewReset.fingerprint } };
}
export function ideaLifecycleCommand(data: IdeaBundleData, action: Exclude<IdeaBundleAction, "edit" | "review">): IdeaCommand {
  const expectedRevision = data.bundle.checksum;
  if (action === "discard") return { action, suffix: "", method: "DELETE", body: { expectedRevision }, label: "Hapus draf" };
  return { action, suffix: "/" + action, method: "POST", body: action === "withdraw"
    ? { expectedRevision, expectedCourseId: data.bundle.courseId } : { expectedRevision },
  label: action === "withdraw" ? "Tarik publikasi" : "Terbitkan bundle" };
}

export function isIdeaCommandReceipt(command: IdeaCommand, scope: LiveIdeaBundle, value: unknown): boolean {
  const result = z.object({ result: z.record(z.string(), z.unknown()) }).safeParse(value);
  if (!result.success) return false;
  const receipt = result.data.result;
  if (command.action === "review") return typeof receipt.reviewId === "string" && receipt.reviewerRole === "admin";
  if (receipt.importId !== scope.id) return false;
  if (command.action === "edit") return checksum.safeParse(receipt.checksum).success;
  if (command.action === "publish") return typeof receipt.publicationId === "string" && typeof receipt.published === "boolean";
  if (command.action === "withdraw") return typeof receipt.withdrawn === "boolean";
  return typeof receipt.discarded === "boolean";
}
