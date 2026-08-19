import type { Metadata } from "next";
import { MaterialWorkspace } from "@/components/admin/material-workspace";
import { assertAdmin } from "@/lib/uploadthing-admin";
import { pageTitle } from "@/lib/site";
import { loadMaterialWorkspaceData } from "../../../data";

export const metadata: Metadata = {
  title: pageTitle("Review Product"),
  description: "Review detail hasil generasi Product.",
};

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function ProductReviewDetailPage({ params }: Props) {
  await assertAdmin();
  const { slug } = await params;
  const data = await loadMaterialWorkspaceData();

  return <MaterialWorkspace {...data} mode="product-detail" detailId={slug} />;
}
