"use client";

import { useState } from "react";
import { BookOpenCheck, FileArchive, Upload } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { AdminTabs, AdminTabsContent, AdminTabsList, AdminTabsTrigger } from "@/components/admin/tabs";
import { IdeaBundleV2Panel, type BundleRow as IdeaBundleRow } from "@/components/admin/idea-bundle-v2-panel";
import { ProductBundleV2Panel, type BundleRow as ProductBundleRow } from "@/components/admin/product-bundle-v2-panel";
import { AuthoringJobBuilder } from "@/components/admin/authoring-job-builder";
import { AuthoringContextExport, type AuthoringContextExportRow } from "@/components/admin/authoring-context-export";
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
  mode: "review" | "manual";
  initialReviewTab: "idea" | "product";
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
}: Props) {
  const firstReviewTab = ideaEnabled ? "idea" : "product";
  const [activeReviewTab, setActiveReviewTab] = useState<"idea" | "product">(initialReviewTab === "idea" && ideaEnabled ? "idea" : initialReviewTab === "product" && productEnabled ? "product" : firstReviewTab);

  return (
    <div className="space-y-8">
      <AdminPageHeader
        icon={mode === "review" ? BookOpenCheck : Upload}
        title={mode === "review" ? "Review materi" : "Upload manual"}
        description={mode === "review" ? "Periksa hasil generasi MCP berdasarkan mata kuliah, waktu dibuat, dan pembuatnya." : "Siapkan Source Pack atau lanjutkan dari Idea terbit untuk alur kerja manual."}
      />

      {mode === "review" ? (
        <div className="space-y-6">
          {!ideaEnabled && !productEnabled ? (
            <AdminEmptyState title="Review MCP belum tersedia" description="Aktifkan workflow bundle terlebih dahulu sebelum mengirim hasil generasi MCP ke Zyx." icon={FileArchive} />
          ) : (
            <AdminTabs value={activeReviewTab} onValueChange={(value) => setActiveReviewTab(value as "idea" | "product")}>
              <AdminTabsList>
                {ideaEnabled && <AdminTabsTrigger value="idea"><FileArchive className="size-4" />Source Pack + Idea</AdminTabsTrigger>}
                {productEnabled && <AdminTabsTrigger value="product"><FileArchive className="size-4" />Product</AdminTabsTrigger>}
              </AdminTabsList>
              {ideaEnabled && <AdminTabsContent value="idea"><IdeaBundleV2Panel initialImports={initialIdeaImports} courseLabels={courseLabels} authorLabels={authorLabels} embedded /></AdminTabsContent>}
              {productEnabled && <AdminTabsContent value="product"><ProductBundleV2Panel initialImports={initialProductImports} courseLabels={courseLabels} authorLabels={authorLabels} embedded /></AdminTabsContent>}
            </AdminTabs>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {authoringEnabled ? (
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
              <AdminSectionIntro />
              <AdminTabs defaultValue="source-pack">
                <AdminTabsList>
                  <AdminTabsTrigger value="source-pack"><FileArchive className="size-4" />Buat paket kerja</AdminTabsTrigger>
                  <AdminTabsTrigger value="context-pack"><BookOpenCheck className="size-4" />Lanjutkan dari Idea terbit</AdminTabsTrigger>
                </AdminTabsList>
                <AdminTabsContent value="source-pack"><AuthoringJobBuilder courses={authoringCourses} /></AdminTabsContent>
                <AdminTabsContent value="context-pack"><AuthoringContextExport initialExports={initialContextExports} courses={authoringCourses} /></AdminTabsContent>
              </AdminTabs>
            </div>
          ) : (
            <AdminEmptyState title="Upload manual belum tersedia" description="Workflow Source Pack manual belum diaktifkan di lingkungan ini." icon={Upload} />
          )}
        </div>
      )}
    </div>
  );
}

function AdminSectionIntro() {
  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-brand-primary/20 bg-brand-primary/5 p-4">
      <FileArchive className="mt-0.5 size-5 shrink-0 text-brand-primary" aria-hidden />
      <div>
        <p className="text-body-sm font-semibold text-foreground">Siapkan paket kerja secara manual</p>
        <p className="mt-1 text-body-sm text-muted-foreground">Unggah Source Pack, pilih mata kuliah dan bab dengan nama yang mudah dikenali, petakan bagian sumber, lalu unduh paket kerja untuk agent. Setiap tahap dapat diperiksa sebelum lanjut.</p>
      </div>
    </div>
  );
}
