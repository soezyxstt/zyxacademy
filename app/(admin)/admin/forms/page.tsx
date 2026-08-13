import type { Metadata } from "next";

import { FileText } from "lucide-react";

import { env } from "@/lib/env";
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
  const presetsEnabled = env.FEATURE_FORM_PRESETS === "1";

  return (
    <div className="space-y-8">
      <AdminPageHeader
        icon={FileText}
        title="Form Studio & Visualizer"
        description="Mendukung 12 jenis soal lengkap, short links (/f/[slug]), unggah berkas, dan custom UI."
      />
      <AdminFormsBuilder presetsEnabled={presetsEnabled} />
    </div>
  );
}
