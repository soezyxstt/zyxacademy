import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ClipboardList } from "lucide-react";
import { pageTitle } from "@/lib/site";
import { PKA_SUBJECTS, PKA_SUBJECT_LABELS } from "@/lib/pka-config";
import { getSubjectStageState } from "@/lib/pka-simulation";
import { requirePkaSession } from "@/lib/pka-enrollment";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { SubjectStageList } from "@/components/pka/subject-stage-list";
import { Reveal } from "@/components/ui/reveal";

export const metadata: Metadata = {
  title: pageTitle("Tutorial PKA - Simulasi"),
  description: "Simulasi kuis PKA bertingkat untuk Matematika, Fisika, dan Kimia; tiga stage per mapel.",
};

export default async function PkaSimulasiPage() {
  const userId = await requirePkaSession("/courses/tutorial-pka/simulasi");

  const subjectStages = await Promise.all(
    PKA_SUBJECTS.map(async (subject) => ({
      subject,
      stages: await getSubjectStageState(userId, subject),
    })),
  );

  const anyAttempted = subjectStages.some(({ stages }) => stages.some((s) => s.status === "completed"));

  return (
    <CoursePageShell
      title="Simulasi"
      description="Tiga stage per mapel, mengikuti alur tes aslinya: lolos di stage awal berarti stage berikutnya dilewati."
      icon={ClipboardList}
    >
      <div className="space-y-6">
        <Reveal>
          <div className="space-y-6">
            {subjectStages.map(({ subject, stages }) => (
              <div key={subject} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <h2 className="mb-1 font-heading text-body-base font-bold text-foreground">
                  {PKA_SUBJECT_LABELS[subject]}
                </h2>
                <SubjectStageList subject={subject} stages={stages} />
              </div>
            ))}
          </div>
        </Reveal>

        {anyAttempted && (
          <Reveal>
            <Link
              href="/courses/tutorial-pka/laporan"
              className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm transition-colors duration-150 hover:border-brand-primary/50"
            >
              <span className="text-body-sm font-semibold text-foreground">Lihat laporan diagnostik lengkap</span>
              <ArrowRight className="size-4 text-brand-primary" />
            </Link>
          </Reveal>
        )}
      </div>
    </CoursePageShell>
  );
}
