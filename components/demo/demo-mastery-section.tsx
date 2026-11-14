"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { DashboardWeakConcepts } from "@/components/course/dashboard-weak-concepts";
import { TranslatedText } from "@/components/i18n/translated-text";
import { useStudentExperience } from "@/components/student-experience-provider";
import type { DemoMastery } from "@/lib/demo/mastery";
import type { DemoSummary } from "./demo-shell";

export function DemoMasterySection({ experiences, mastery }: { experiences: DemoSummary[]; mastery: Record<string, DemoMastery> }) {
  const { route } = useStudentExperience();
  return <section className="space-y-6">{experiences.map(({ snapshot, content }) => {
    const model = mastery[snapshot.courseId];
    const concepts = model?.groups.flatMap(group => group.concepts) ?? [];
    const displayed = concepts.length ? concepts : snapshot.weakConcepts.map(item => ({ conceptName: item.title, masteryScore: item.masteryPercent, trend: "stable" as const }));
    return <div key={snapshot.courseId}>
      <DashboardWeakConcepts courseTitle={content.course.title} concepts={displayed.map(item => ({ ...item, evidenceCount: 3, isMeasured: true }))} />
      <Link href={route("mastery", snapshot.courseId)} className="mt-3 pt-2.5 border-t border-border/40 inline-flex items-center gap-1 text-body-xs font-semibold text-brand-primary hover:underline">
        <TranslatedText namespace="student" messageKey="dashboard.fullMasteryMap" /><ArrowUpRight className="size-3.5" />
      </Link>
    </div>;
  })}</section>;
}
