"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpenCheck, FileArchive } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlTab } from "@/hooks/use-url-tab";
import type { BundleRow as IdeaBundleRow } from "@/components/admin/idea-bundle-v2-panel";
import type { MaterialBundleRow as ProductBundleRow } from "@/components/admin/material-workflow-ui";
import { MaterialArtifactList } from "@/components/admin/material-artifact-list";
import { MaterialBundleUploadDialog } from "@/components/admin/material-bundle-upload-dialog";
import { IdeaBundleReviewDetail, ProductBundleReviewDetail } from "@/components/admin/material-review-detail";
import type { LockedCourseInfo } from "@/lib/admin/course-identity";

type Props = {
  initialIdeaImports: IdeaBundleRow[];
  initialProductImports: ProductBundleRow[];
  courseLabels: Record<string, string>;
  authorLabels: Record<string, string>;
  ideaEnabled: boolean;
  productEnabled: boolean;
  mode: "review" | "idea-detail" | "product-detail";
  initialReviewTab?: "idea" | "product";
  detailId?: string;
  lockedCourse?: LockedCourseInfo;
  backHref?: string;
  backLabel?: string;
  hideHeader?: boolean;
};

export function MaterialWorkspace({
  initialIdeaImports,
  initialProductImports,
  courseLabels,
  authorLabels,
  ideaEnabled,
  productEnabled,
  mode,
  initialReviewTab,
  detailId,
  lockedCourse,
  backHref,
  backLabel,
  hideHeader = Boolean(lockedCourse) && mode === "review",
}: Props) {
  const router = useRouter();
  const firstReviewTab = initialReviewTab ?? (ideaEnabled ? "idea" : "product");
  const [activeReviewTab, setActiveReviewTab] = useUrlTab("tab", firstReviewTab);
  const [uploadKind, setUploadKind] = useState<"idea" | "product" | null>(null);
  const detailMode = mode === "idea-detail" || mode === "product-detail";

  function openDetail(kind: "idea" | "product", id: string) {
    if (lockedCourse) {
      router.push(`/admin/courses/${encodeURIComponent(lockedCourse.slug)}/review/${kind}/${encodeURIComponent(id)}`);
    } else {
      router.push(`/admin/materials/review/${kind}/${encodeURIComponent(id)}`);
    }
  }

  const effectiveBackHref = backHref ?? (detailMode ? (lockedCourse ? `/admin/courses/${encodeURIComponent(lockedCourse.slug)}/review` : "/admin/materials/review") : undefined);
  const effectiveBackLabel = backLabel ?? (detailMode ? (lockedCourse ? `Kembali ke Review ${lockedCourse.title}` : "Kembali ke daftar review") : undefined);

  return (
    <div className="space-y-8">
      {!hideHeader && (
        <AdminPageHeader
          icon={BookOpenCheck}
          title={detailMode ? mode === "idea-detail" ? "Review Source Pack + Idea" : "Review Product" : lockedCourse ? `Review Materi · ${lockedCourse.title}` : "Review materi"}
          description={detailMode ? "Periksa isi artifact, bukti sumber, dan keputusan review pada halaman khusus." : "Cari hasil generasi MCP berdasarkan mata kuliah, pembuat, status, dan waktu masuk."}
          backHref={effectiveBackHref}
          backLabel={effectiveBackLabel}
        />
      )}

      {detailMode ? (
        mode === "idea-detail" ? (
          <IdeaBundleReviewDetail
            detailId={detailId ?? ""}
            courseLabels={courseLabels}
            backHref={effectiveBackHref}
            backLabel={effectiveBackLabel}
          />
        ) : (
          <ProductBundleReviewDetail
            detailId={detailId ?? ""}
            courseLabels={courseLabels}
            backHref={effectiveBackHref}
            backLabel={effectiveBackLabel}
          />
        )
      ) : (
        <div className="space-y-6">
          <Tabs value={activeReviewTab} onValueChange={(value) => setActiveReviewTab(value as "idea" | "product")}>
            <TabsList>
              {ideaEnabled && <TabsTrigger value="idea"><FileArchive className="size-4" />Source Pack + Idea</TabsTrigger>}
              {productEnabled && <TabsTrigger value="product"><FileArchive className="size-4" />Product Bundle</TabsTrigger>}
            </TabsList>
            {ideaEnabled && <TabsContent value="idea"><MaterialArtifactList rows={initialIdeaImports} kind="idea" courseLabels={courseLabels} authorLabels={authorLabels} onInspect={(id) => openDetail("idea", id)} onUpload={() => setUploadKind("idea")} lockedCourse={lockedCourse} /><MaterialBundleUploadDialog kind="idea" open={uploadKind === "idea"} onOpenChange={(open) => setUploadKind(open ? "idea" : null)} onStaged={(id) => openDetail("idea", id)} /></TabsContent>}
            {productEnabled && <TabsContent value="product"><MaterialArtifactList rows={initialProductImports} kind="product" courseLabels={courseLabels} authorLabels={authorLabels} onInspect={(id) => openDetail("product", id)} onUpload={() => setUploadKind("product")} lockedCourse={lockedCourse} /><MaterialBundleUploadDialog kind="product" open={uploadKind === "product"} onOpenChange={(open) => setUploadKind(open ? "product" : null)} onStaged={(id) => openDetail("product", id)} /></TabsContent>}
          </Tabs>
        </div>
      )}
    </div>
  );
}
