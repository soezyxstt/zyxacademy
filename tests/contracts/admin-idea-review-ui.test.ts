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
    expect(withdrawRoute).toContain("withdrawIdeaBundle");
    expect(withdrawRoute).toContain('session.user.role !== "admin"');
  });

  test("Idea lifecycle services retire published entities and remove draft records", () => {
    const publication = source("lib/bundle/publication.ts");
    const staging = source("lib/bundle/staging.ts");
    expect(publication).toContain("export async function withdrawIdeaBundle");
    expect(publication).toContain('set({ status: "withdrawn", updatedAt: now })');
    expect(publication).toContain('action: "delete" as const');
    expect(publication).toContain('action: "withdrawn"');
    expect(staging).toContain("export async function discardIdeaBundleDraft");
    expect(staging).toContain("tx.delete(reviewItemBundle)");
    expect(staging).toContain("tx.delete(imporBundle)");
    expect(staging).toContain("await deleteArtifact(row.sourceUriOrKey)");
  });
});
