import type { Metadata } from "next";
import { MaterialWorkspace } from "@/components/admin/material-workspace";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { pageTitle } from "@/lib/site";
import { loadMaterialWorkspaceData } from "../data";

export const metadata: Metadata = {
  title: pageTitle("Review Materi"),
  description: "Review hasil generasi MCP untuk materi Zyx.",
};

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ section?: string }>;
};

export default async function MaterialReviewPage({ searchParams }: Props) {
  await assertAdmin();
  const params = await searchParams;
  const data = await loadMaterialWorkspaceData();

  return (
    <MaterialWorkspace
      {...data}
      mode="review"
      initialReviewTab={params.section === "product" ? "product" : "idea"}
    />
  );
}
