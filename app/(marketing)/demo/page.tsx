import { notFound } from "next/navigation";
import { parseDemoSelection, type DemoSearchParams } from "@/lib/demo/selection";
import { getDemoExperience } from "./demo-data";
import type { Metadata } from "next";
import { DemoDashboard } from "@/components/demo/demo-dashboard";
import { DemoEmptyState } from "@/components/demo/demo-empty-state";
import { DemoShell } from "@/components/demo/demo-shell";
import { getDemoExperiences } from "./demo-data";

import { createLocalizedMetadata } from "@/lib/site-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return createLocalizedMetadata({ path: "/demo", titleKey: "meta.demo.title", descriptionKey: "meta.demo.description", noIndex: true });
}


export const dynamic = "force-dynamic";

export default async function DemoPage({ searchParams }: { searchParams: Promise<DemoSearchParams> }) {
  const experiences = await getDemoExperiences();
  if (!experiences.length) return <DemoEmptyState />;
  const parsed = parseDemoSelection(await searchParams);
  if (!parsed) notFound();
  const courseId = parsed.course ?? experiences[0].snapshot.courseId;
  if (!experiences.some((item) => item.snapshot.courseId === courseId)) notFound();
  const experience = await getDemoExperience(courseId, parsed.selection);
  if (!experience) notFound();
  const { page, articles, diktats, flashcardSets } = experience.content.collections;
  if (page.offset > 0 && !articles.length && !diktats.length && !flashcardSets.length) notFound();
  const summaries = experiences.map(({ snapshot, content }) => ({ snapshot, content: { course: content.course } }));
  return (
    <DemoShell experiences={summaries} selected={{ snapshot: experience.snapshot, content: { course: experience.content.course } }} activeView="dashboard" selection={parsed.selection}>
      <DemoDashboard experiences={summaries} selected={experience} />
    </DemoShell>
  );
}
