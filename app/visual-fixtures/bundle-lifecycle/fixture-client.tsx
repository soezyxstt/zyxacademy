"use client";

import { MaterialWorkspace } from "@/components/admin/material-workspace";
import { IdeaBundleReviewDetail, ProductBundleReviewDetail } from "@/components/admin/material-review-detail";
import { IdeaBundleV2Panel } from "@/components/admin/idea-bundle-v2-panel";

export function BundleLifecycleFixture({ mode }: { mode?: string }) {
  return <main className="mx-auto max-w-7xl space-y-4 p-4">
    {mode?.startsWith("workspace-") ? <MaterialWorkspace initialIdeaImports={[]} initialProductImports={[]} courseLabels={{}} authorLabels={{}} ideaEnabled productEnabled mode={mode === "workspace-idea" ? "idea-detail" : "product-detail"} detailId={mode === "workspace-idea" ? "visual-idea" : "visual-product"} /> : mode === "idea" ? <IdeaBundleReviewDetail detailId="visual-idea" /> : mode === "panel" ? <IdeaBundleV2Panel embedded initialImports={[{ id: "visual-idea", bundleId: "idea-bundle", checksum: "a".repeat(64), courseId: "course", status: "validated", validationReport: { ideaCount: 1 }, createdAt: "2026-01-01T00:00:00Z" }]} /> : <ProductBundleReviewDetail detailId={mode === "solution" ? "fixture-import" : "visual-product"} />}
  </main>;
}
