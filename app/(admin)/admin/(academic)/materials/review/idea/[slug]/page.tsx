import type { Metadata } from "next";
import { MaterialWorkspace } from "@/components/admin/material-workspace";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { pageTitle } from "@/lib/site";
import { loadMaterialWorkspaceData } from "../../../data";

export const metadata: Metadata = {
  title: pageTitle("Review Source Pack + Idea"),
  description: "Review detail hasil generasi Source Pack dan Idea.",
};

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function IdeaReviewDetailPage({ params }: Props) {
  await assertAdmin();
  const { slug } = await params;
  const data = await loadMaterialWorkspaceData();

  return <MaterialWorkspace {...data} mode="idea-detail" detailId={slug} />;
}
