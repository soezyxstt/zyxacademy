import type { Metadata } from "next";
import { MaterialWorkspace } from "@/components/admin/material-workspace";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { pageTitle } from "@/lib/site";
import { loadMaterialWorkspaceData } from "../data";

export const metadata: Metadata = {
  title: pageTitle("Upload Manual"),
  description: "Siapkan Source Pack dan Context Pack secara manual untuk materi Zyx.",
};

export const dynamic = "force-dynamic";

export default async function MaterialManualPage() {
  await assertAdmin();
  const data = await loadMaterialWorkspaceData();

  return <MaterialWorkspace {...data} mode="manual" initialReviewTab="idea" />;
}
