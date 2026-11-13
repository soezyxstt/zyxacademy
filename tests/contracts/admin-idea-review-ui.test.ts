import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Admin Idea review workspace contract", () => {
  test("course pages do not repeat course descriptions in cards", () => {
    const courseHeader = source("components/admin/course-detail/course-detail-header.tsx");
    const courseDashboard = source("components/admin/courses-dashboard.tsx");
    expect(courseHeader).not.toContain("course.description ?");
    expect(courseHeader).not.toContain("bg-card/60");
    expect(courseDashboard).not.toContain("Belum ada deskripsi mata kuliah.");
    expect(courseDashboard).not.toContain("{c.description && (");
  });

  test("course-scoped bundle detail routes hide the duplicate workspace header", () => {
    const ideaPage = source("app/(admin)/admin/(academic)/courses/[slug]/review/idea/[bundleId]/page.tsx");
    const productPage = source("app/(admin)/admin/(academic)/courses/[slug]/review/product/[bundleId]/page.tsx");
    expect(ideaPage).toContain("hideHeader");
    expect(productPage).toContain("hideHeader");
  });

  test("Idea review uses one selector, local item updates, readable evidence, and lifecycle actions", () => {
    const detail = source("components/admin/material-review-detail.tsx");
    expect(detail).not.toContain('placeholder="Pilih Idea..."');
    expect(detail).toContain('setPayload((current) => current ? { ...current, itemReviews: nextReviews } : current)');
    expect(detail).toContain("shortIdeaCode(idea.code)");
    expect(detail).toContain("readableSourceExcerpt(proof.excerpt)");
    expect(detail).toContain('setConfirmAction("discard")');
    expect(detail).toContain('setConfirmAction("withdraw")');
    expect(detail).not.toContain(">Bagian belajar</p>");
  });

  test("Idea API exposes guarded discard and withdrawal operations", () => {
    const detailRoute = source("app/api/admin/bundles/idea/[id]/route.ts");
    const withdrawRoute = source("app/api/admin/bundles/idea/[id]/withdraw/route.ts");
    expect(detailRoute).toContain("export async function DELETE");
    expect(detailRoute).toContain("discardIdeaBundleDraft");
    expect(detailRoute).toContain("expectedRevision: body.expectedRevision");
    expect(source("app/api/admin/bundles/[kind]/[id]/item-reviews/route.ts")).toContain("expectedRevision: parsed.data.expectedRevision");
    expect(withdrawRoute).toContain("withdrawIdeaBundle");
    expect(detailRoute.slice(detailRoute.indexOf("export async function DELETE"))).toContain("await assertAdmin()");
    expect(withdrawRoute).toContain("await assertAdmin()");
    expect(withdrawRoute).not.toContain('session.user.role !== "admin"');
  });

  test("Idea review and publish use the displayed revision and require item decisions", () => {
    const detail = source("components/admin/material-review-detail.tsx").split("const blockReviewTones")[0];
    const oldPanel = source("components/admin/idea-bundle-v2-panel.tsx");
    const reviewRoute = source("app/api/admin/bundles/idea/[id]/review/route.ts");
    const publishRoute = source("app/api/admin/bundles/idea/[id]/publish/route.ts");
    expect(detail).toContain('JSON.stringify({ decision, notes: reviewNote || undefined, expectedRevision: payload.bundle.checksum })');
    expect(detail).toContain('JSON.stringify({ expectedRevision: payload.bundle.checksum })');
    expect(detail).toContain('disabled={saving || editing || hasUnsavedItemNotes || !allIdeasApproved}');
    expect(detail).toContain('disabled={saving || editing || hasUnsavedItemNotes || !allIdeasReviewed}');
    expect(oldPanel).toContain('/admin/materials/review/idea/${encodeURIComponent(selected.id)}');
    expect(oldPanel).not.toContain('/publish`');
    expect(oldPanel).not.toContain('/review`');
    expect(reviewRoute).toContain('expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),');
    expect(publishRoute).toContain('expectedRevision: parsed.data.expectedRevision');
  });

  test("Idea lifecycle services retire published entities and remove draft records", () => {
    const publication = source("lib/bundle/publication.ts");
    const staging = source("lib/bundle/staging.ts");
    expect(publication).toContain("export async function withdrawIdeaBundle");
    expect(publication).toContain('set({ status: "withdrawn", updatedAt: now })');
    expect(publication).toContain('action: "delete" as const');
    expect(publication).toContain('action: "withdrawn"');
    expect(publication).toContain("assertAuthoringActor(tx, input.withdrawnBy");
    expect(staging).toContain("export async function discardIdeaBundleDraft");
    expect(staging).toContain("assertAuthoringActor(tx, input.actorId");
    expect(staging).toContain('.for("update")');
    expect(staging).not.toContain("await deleteArtifact(");
    expect(staging).toContain("tx.delete(reviewItemBundle)");
    expect(staging).toContain("tx.delete(imporBundle)");
    expect(staging.slice(staging.indexOf("export async function discardIdeaBundleDraft"))).toContain("return db.transaction");
    expect(source("db/schema.ts")).toContain('"withdrawn" | "discarding"');
  });
});
