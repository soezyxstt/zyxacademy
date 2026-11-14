import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { DocsIndex } from "@/app/(admin)/admin/docs/docs-index";
import { DocsSidebar } from "@/app/(admin)/admin/docs/docs-sidebar";
import FormsLoading from "@/app/(admin)/admin/forms/loading";
import FormDetailLoading from "@/app/(admin)/admin/forms/[id]/loading";
import MeetLoading from "@/app/(admin)/admin/meet/loading";
import MeetDetailLoading from "@/app/(admin)/admin/meet/[id]/loading";
import OpsLoading from "@/app/(admin)/admin/ops/loading";
import FlagsLoading from "@/app/(admin)/admin/ops/flags/loading";
import AnalyticsLoading from "@/app/(admin)/admin/ops/analytics/loading";
import KeysLoading from "@/app/(admin)/admin/ops/keys/loading";
import ShortLinksLoading from "@/app/(admin)/admin/ops/short-links/loading";
import DocsLoading from "@/app/(admin)/admin/docs/loading";
import DocLoading from "@/app/(admin)/admin/docs/[slug]/loading";
import {
  DocumentTextSkeleton,
  FormListSkeleton,
  LeaderboardRowsSkeleton,
  MediaItemsSkeleton,
  ParticipantPickerSkeleton,
  ProductCatalogSkeleton,
  PublicLinksSkeleton,
  QuestionPickerSkeleton,
  QuizPreviewSkeleton,
  ReviewDetailSkeleton,
  VoucherListSkeleton,
  ZyraOpsSkeleton,
  ZyraUsageSkeleton,
} from "@/components/admin/content-loading-skeletons";

export default async function AdminSkeletonFixture({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { state } = await searchParams;
  const states: Record<string, ReactNode> = {
    "route-forms": <FormsLoading />,
    "route-form-detail": <FormDetailLoading />,
    "route-meet": <MeetLoading />,
    "route-meet-detail": <MeetDetailLoading />,
    "route-ops": <OpsLoading />,
    "route-flags": <FlagsLoading />,
    "route-analytics": <AnalyticsLoading />,
    "route-keys": <KeysLoading />,
    "route-short-links": <ShortLinksLoading />,
    docs: (
      <DocsSidebar>
        <DocsIndex />
      </DocsSidebar>
    ),
    "docs-loading": (
      <DocsSidebar>
        <DocsLoading />
      </DocsSidebar>
    ),
    "article-loading": (
      <DocsSidebar>
        <DocLoading />
      </DocsSidebar>
    ),
    catalog: <ProductCatalogSkeleton />,
    voucher: <VoucherListSkeleton />,
    quiz: <QuizPreviewSkeleton label="Memuat" />,
    review: <ReviewDetailSkeleton label="Memuat" />,
    ops: <ZyraOpsSkeleton />,
    participants: (
      <div className="rounded-xl border border-border">
        <ParticipantPickerSkeleton label="Memuat" />
      </div>
    ),
    leaderboard: (
      <div className="rounded-xl border border-border">
        <LeaderboardRowsSkeleton label="Memuat" />
      </div>
    ),
    usage: <ZyraUsageSkeleton />,
    forms: <FormListSkeleton />,
    questions: <QuestionPickerSkeleton label="Memuat" />,
    "media-grid": <MediaItemsSkeleton />,
    "media-list": <MediaItemsSkeleton view="list" />,
    links: <PublicLinksSkeleton />,
    document: <DocumentTextSkeleton />,
  };
  const content = states[state ?? ""];
  if (!content) notFound();
  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:pl-72 lg:pr-8">
      {content}
    </main>
  );
}
