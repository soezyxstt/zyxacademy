import { Suspense } from "react";
import { DemoMasterySection } from "@/components/demo/demo-mastery-section";
import { DemoMasterySkeleton, DemoTodayPlanSkeleton } from "@/components/demo/demo-loading";
import { getDemoMastery } from "@/lib/demo/mastery-repository";
import type { DemoSummary } from "@/components/demo/demo-shell";
import { env } from "@/lib/env";
import { notFound } from "next/navigation";
import { parseDemoSelection, type DemoSearchParams } from "@/lib/demo/selection";
import { getDemoExperience as loadDemoExperience } from "./demo-data";
import type { Metadata } from "next";
import { DemoDashboard, DemoTodayPlan } from "@/components/demo/demo-dashboard";
import { DemoEmptyState } from "@/components/demo/demo-empty-state";
import { DemoShell } from "@/components/demo/demo-shell";
import { getDemoSummaries } from "@/lib/demo/summary-repository";

import { createLocalizedMetadata } from "@/lib/site-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return createLocalizedMetadata({ path: "/demo", titleKey: "meta.demo.title", descriptionKey: "meta.demo.description", noIndex: true });
}


export const dynamic = "force-dynamic";

export default async function DemoPage({ searchParams }: { searchParams: Promise<DemoSearchParams> }) {
  const ui = { showLive: env.FEATURE_LIVE === "1" };
  const summaries = await getDemoSummaries();
  if (!summaries.length) return <DemoEmptyState />;
  const parsed = parseDemoSelection(await searchParams);
  if (!parsed) notFound();
  const courseId = parsed.course ?? summaries[0].snapshot.courseId;
  const selected = summaries.find((item) => item.snapshot.courseId === courseId);
  if (!selected) notFound();
  return <DemoShell showLive={ui.showLive} experiences={summaries} selected={selected} activeView="dashboard" selection={parsed.selection}>
    <DemoDashboard experiences={summaries} selected={selected}
      todayPlan={<Suspense key={`${courseId}:${JSON.stringify(parsed.selection)}`} fallback={<DemoTodayPlanSkeleton />}><DemoTodayPlanContent courseId={courseId} selection={parsed.selection} /></Suspense>}
      masterySection={<Suspense fallback={<DemoMasterySkeleton />}><DemoMasteryContent experiences={summaries} /></Suspense>}
    />
  </DemoShell>;
}

async function DemoTodayPlanContent({ courseId, selection }: { courseId: string; selection: import("./demo-data").DemoProductSelection }) {
  // The fixture resolver also supports the two-argument form; extra arguments are optional.
  const loadForKind: (id: string, selected: typeof selection, kind: "all" | "article") => ReturnType<typeof loadDemoExperience> = loadDemoExperience;
  // A nonzero collection cursor still needs the original collection validation.
  const getDemoExperience = (id: string, selected: typeof selection) => loadForKind(id, selected, selected.collectionOffset ? "all" : "article");
  const experience = await getDemoExperience(courseId, selection);
  if (!experience) notFound();
  const { page, articles, diktats, flashcardSets } = experience.content.collections;
  if (page.offset > 0 && !articles.length && !diktats.length && !flashcardSets.length) notFound();
  return <DemoTodayPlan selected={{ snapshot: experience.snapshot, article: { id: experience.content.article.id, title: experience.content.article.title } }} />;
}

async function DemoMasteryContent({ experiences }: { experiences: DemoSummary[] }) {
  const mastery = await getDemoMastery(experiences.map(({ snapshot }) => snapshot.courseId));
  return <DemoMasterySection experiences={experiences} mastery={mastery} />;
}
