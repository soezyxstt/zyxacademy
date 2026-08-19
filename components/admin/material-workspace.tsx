"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpenCheck, FileArchive, Upload } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { AdminTabs, AdminTabsContent, AdminTabsList, AdminTabsTrigger } from "@/components/admin/tabs";
import type { BundleRow as IdeaBundleRow } from "@/components/admin/idea-bundle-v2-panel";
import type { BundleRow as ProductBundleRow } from "@/components/admin/product-bundle-v2-panel";
import { AuthoringJobBuilder } from "@/components/admin/authoring-job-builder";
import { AuthoringContextExport, type AuthoringContextExportRow } from "@/components/admin/authoring-context-export";
import { MaterialArtifactList } from "@/components/admin/material-artifact-list";
import { MaterialBundleUploadDialog } from "@/components/admin/material-bundle-upload-dialog";
import { IdeaBundleReviewDetail, ProductBundleReviewDetail } from "@/components/admin/material-review-detail";
import type { AuthoringCourseOption } from "@/lib/authoring/catalog";

type Props = {
  initialIdeaImports: IdeaBundleRow[];
  initialProductImports: ProductBundleRow[];
  courseLabels: Record<string, string>;
  authorLabels: Record<string, string>;
  authoringCourses: AuthoringCourseOption[];
  initialContextExports: AuthoringContextExportRow[];
  ideaEnabled: boolean;
  productEnabled: boolean;
  authoringEnabled: boolean;
  mode: "review" | "manual" | "idea-detail" | "product-detail";
  initialReviewTab?: "idea" | "product";
  detailId?: string;
};

export function MaterialWorkspace({
  initialIdeaImports,
  initialProductImports,
  courseLabels,
  authorLabels,
  authoringCourses,
  initialContextExports,
  ideaEnabled,
  productEnabled,
  authoringEnabled,
  mode,
  initialReviewTab,
  detailId,
}: Props) {
  const router = useRouter();
  const firstReviewTab = ideaEnabled ? "idea" : "product";
  const [activeReviewTab, setActiveReviewTab] = useState<"idea" | "product">(initialReviewTab === "idea" && ideaEnabled ? "idea" : initialReviewTab === "product" && productEnabled ? "product" : firstReviewTab);
  const [uploadKind, setUploadKind] = useState<"idea" | "product" | null>(null);
  const detailMode = mode === "idea-detail" || mode === "product-detail";

  function openDetail(kind: "idea" | "product", id: string) {
    router.push(`/admin/materials/review/${kind}/${encodeURIComponent(id)}`);
  }

  return (
    <div className="space-y-8">
      <AdminPageHeader
        icon={detailMode ? BookOpenCheck : mode === "review" ? BookOpenCheck : Upload}
        title={detailMode ? mode === "idea-detail" ? "Review Source Pack + Idea" : "Review Product" : mode === "review" ? "Review materi" : "Upload manual"}
        description={detailMode ? "Periksa isi artifact, bukti sumber, dan keputusan review pada halaman khusus." : mode === "review" ? "Cari hasil generasi MCP berdasarkan mata kuliah, pembuat, status, dan waktu masuk." : "Siapkan Source Pack atau lanjutkan dari Idea terbit untuk alur kerja manual."}
        backHref={detailMode ? "/admin/materials/review" : undefined}
        backLabel={detailMode ? "Kembali ke daftar review" : undefined}
      />

      {detailMode ? (
        mode === "idea-detail" ? <IdeaBundleReviewDetail detailId={detailId ?? ""} courseLabels={courseLabels} /> : <ProductBundleReviewDetail detailId={detailId ?? ""} courseLabels={courseLabels} />
      ) : mode === "review" ? (
        <div className="space-y-6">
          {!ideaEnabled && !productEnabled ? (
            <AdminEmptyState title="Review MCP belum tersedia" description="Aktifkan workflow bundle terlebih dahulu sebelum mengirim hasil generasi MCP ke Zyx." icon={FileArchive} />
          ) : (
            <AdminTabs value={activeReviewTab} onValueChange={(value) => setActiveReviewTab(value as "idea" | "product")}>
              <AdminTabsList>
                {ideaEnabled && <AdminTabsTrigger value="idea"><FileArchive className="size-4" />Source Pack + Idea</AdminTabsTrigger>}
                {productEnabled && <AdminTabsTrigger value="product"><FileArchive className="size-4" />Product</AdminTabsTrigger>}
              </AdminTabsList>
              {ideaEnabled && <AdminTabsContent value="idea"><MaterialArtifactList rows={initialIdeaImports} kind="idea" courseLabels={courseLabels} authorLabels={authorLabels} onInspect={(id) => openDetail("idea", id)} onUpload={() => setUploadKind("idea")} /><MaterialBundleUploadDialog kind="idea" open={uploadKind === "idea"} onOpenChange={(open) => setUploadKind(open ? "idea" : null)} onStaged={(id) => openDetail("idea", id)} /></AdminTabsContent>}
              {productEnabled && <AdminTabsContent value="product"><MaterialArtifactList rows={initialProductImports} kind="product" courseLabels={courseLabels} authorLabels={authorLabels} onInspect={(id) => openDetail("product", id)} onUpload={() => setUploadKind("product")} /><MaterialBundleUploadDialog kind="product" open={uploadKind === "product"} onOpenChange={(open) => setUploadKind(open ? "product" : null)} onStaged={(id) => openDetail("product", id)} /></AdminTabsContent>}
            </AdminTabs>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {authoringEnabled ? (
            <AdminTabs defaultValue="source-pack">
              <AdminTabsList>
                <AdminTabsTrigger value="source-pack"><FileArchive className="size-4" />Buat paket kerja</AdminTabsTrigger>
                <AdminTabsTrigger value="context-pack"><BookOpenCheck className="size-4" />Lanjutkan dari Idea terbit</AdminTabsTrigger>
              </AdminTabsList>
              <AdminTabsContent value="source-pack"><AuthoringJobBuilder courses={authoringCourses} /></AdminTabsContent>
              <AdminTabsContent value="context-pack"><AuthoringContextExport initialExports={initialContextExports} courses={authoringCourses} /></AdminTabsContent>
            </AdminTabs>
          ) : (
            <AdminEmptyState title="Upload manual belum tersedia" description="Workflow Source Pack manual belum diaktifkan di lingkungan ini." icon={Upload} />
          )}
        </div>
      )}
    </div>
  );
}
