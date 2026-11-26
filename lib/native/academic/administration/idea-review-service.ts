import "server-only";

import { eq } from "drizzle-orm";
import { mataKuliah } from "@/db/schema";
import { matchesCourseIdentity, resolveCourseIdentity } from "@/lib/admin/course-identity";
import { revisionOf } from "@/lib/admin-mcp/revision";
import { getIdeaBundleImport, hasIdeaRevisionReviewEvidence, ideaItemReviewRevision, listIdeaItemReviews, parseStagedIdeaBundle, upsertIdeaItemReview } from "@/lib/bundle/staging";
import type { ValidatedIdeaBundle } from "@/lib/bundle/idea-bundle-v2";
import { canEditIdeaReview, type IdeaReviewDraft, type IdeaReviewTarget } from "@/packages/academic/idea-item-review";
import { previewIdeaBundle } from "@/lib/bundle/idea-preview";
import { assertNativeAdminTransaction, type NativeAdminViewer } from "./admin-transaction";

function itemContent(artifact: ValidatedIdeaBundle, ideaId: string) {
  const idea = previewIdeaBundle(artifact).ideas.find((entry) => entry.id === ideaId);
  if (!idea) return null;
  const sources = idea.provenance.map((entry) => ({
    title: entry.sourceTitle, excerpt: entry.excerpt,
    locator: [entry.sectionLocator, entry.pageNumber == null ? null : `Halaman ${entry.pageNumber}`].filter(Boolean).join(" · ") || null,
  }));
  const size = [idea.code, idea.canonicalStatement, idea.conciseExplanation, idea.latex ?? "",
    ...sources.flatMap((source) => [source.title, source.excerpt, source.locator ?? ""])]
    .reduce((total, value) => total + value.length, 0);
  if (size > 32_000 || sources.length > 20) throw new Error("IDEA_ITEM_REVIEW_WEB_REQUIRED");
  return { code: idea.code, statement: idea.canonicalStatement, explanation: idea.conciseExplanation, latex: idea.latex, sources };
}

export async function readNativeIdeaReview(slug: string, importId: string, ideaId: string, actorId: string): Promise<IdeaReviewTarget | null> {
  const [course, bundle] = await Promise.all([resolveCourseIdentity(slug), getIdeaBundleImport(importId)]);
  if (!course || !bundle || !matchesCourseIdentity(bundle.courseId, course)) return null;
  const [artifact, reviews, immutable] = await Promise.all([
    parseStagedIdeaBundle(importId), listIdeaItemReviews(importId, actorId),
    hasIdeaRevisionReviewEvidence({ importId, reviewerId: actorId, expectedRevision: bundle.checksum }),
  ]);
  if (artifact.manifest.bundleChecksum !== bundle.checksum || !matchesCourseIdentity(artifact.manifest.courseId, course)) throw new Error("IDEA_BUNDLE_STALE_CONTEXT");
  const content = itemContent(artifact, ideaId);
  if (!content) return null;
  const current = reviews.find((row) => row.targetId === ideaId && row.productId === null);
  return {
    courseId: course.primaryId, importId, ideaId, ...content,
    editable: !immutable && canEditIdeaReview(bundle.status),
    review: {
      expectedRevision: bundle.checksum, expectedReviewRevision: ideaItemReviewRevision(current),
      status: current?.status ?? "pending", notes: current?.notes ?? "",
    },
  };
}

export async function writeNativeIdeaReview(slug: string, importId: string, ideaId: string, draft: IdeaReviewDraft, requestId: string, viewer: NativeAdminViewer) {
  const [course, bundle] = await Promise.all([resolveCourseIdentity(slug), getIdeaBundleImport(importId)]);
  if (!course || !bundle || !matchesCourseIdentity(bundle.courseId, course)) throw new Error("IDEA_BUNDLE_NOT_FOUND");
  await upsertIdeaItemReview({
    importId, reviewerId: viewer.user.id, ideaId, status: draft.status, notes: draft.notes, expectedRevision: draft.expectedRevision,
    command: {
      expectedReviewRevision: draft.expectedReviewRevision,
      receiptId: `audit-native-idea-item-${revisionOf([viewer.session.id, viewer.user.id, course.primaryId, importId, ideaId, requestId])}`,
      requestDigest: revisionOf(draft),
      verifyArtifact(artifact) {
        if (!matchesCourseIdentity(artifact.manifest.courseId, course)) throw new Error("IDEA_BUNDLE_STALE_CONTEXT");
        itemContent(artifact, ideaId);
      },
      async authorize(tx, courseId) {
        await assertNativeAdminTransaction(tx, viewer);
        const latest = await resolveCourseIdentity(slug, tx);
        if (!latest || latest.primaryId !== course.primaryId || !matchesCourseIdentity(courseId, latest)) throw new Error("IDEA_BUNDLE_NOT_FOUND");
        if (latest.canonicalId) {
          const [locked] = await tx.select({ legacyId: mataKuliah.legacyCourseId }).from(mataKuliah)
            .where(eq(mataKuliah.id, latest.canonicalId)).limit(1).for("share");
          if (!locked || locked.legacyId !== latest.legacyId) throw new Error("IDEA_BUNDLE_STALE_CONTEXT");
        }
      },
    },
  });
}
