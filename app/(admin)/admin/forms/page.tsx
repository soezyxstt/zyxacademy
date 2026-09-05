import { Suspense } from "react";
import type { Metadata } from "next";

import { FileText, RefreshCw } from "lucide-react";

import { pageTitle } from "@/lib/site";
import { AdminPageHeader } from "@/components/admin/page-header";
import AdminFormsBuilder from "@/components/forms/admin-forms-builder";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: pageTitle("Form Studio & Visualizer"),
  description:
    "Kelola Form Studio Zyx: builder 12 jenis pertanyaan, visualisasi data, spreadsheet Google Sheets, dan preset formulir.",
};

export default async function AdminFormsPage() {
  const presetsEnabled = true;

  return (
    <div className="space-y-8">
      <AdminPageHeader
        icon={FileText}
        title="Form Studio & Visualizer"
        description="Mendukung 12 jenis soal lengkap, short links (/f/[slug]), unggah berkas, dan custom UI."
      />
      <Suspense
        fallback={
          <div className="flex h-60 items-center justify-center rounded-2xl border border-border bg-card">
            <RefreshCw className="size-6 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <AdminFormsBuilder presetsEnabled={presetsEnabled} />
      </Suspense>
    </div>
  );
}
