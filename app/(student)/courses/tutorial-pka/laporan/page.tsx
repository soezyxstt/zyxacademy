import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { createMetadata, pageTitle } from "@/lib/site";
import { PKA_SUBJECTS } from "@/lib/pka-config";
import { getDiagnosticSummary } from "@/lib/pka-simulation";
import { requirePkaSession } from "@/lib/pka-enrollment";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { DiagnosticReport } from "@/components/pka/diagnostic-report";
import { Reveal } from "@/components/ui/reveal";

export const metadata: Metadata = createMetadata({
  title: "Laporan Diagnostik Tutorial PKA",
  description: "Ringkasan hasil simulasi PKA kamu di ketiga mapel.",
  path: "/courses/tutorial-pka/laporan",
});


export default async function PkaLaporanPage() {
  const userId = await requirePkaSession("/courses/tutorial-pka/laporan");
  const results = await getDiagnosticSummary(userId, PKA_SUBJECTS);

  return (
    <CoursePageShell
      title="Laporan diagnostik"
      description="Ringkasan hasil simulasi PKA kamu di ketiga mapel."
      icon={BarChart3}
    >
      <Reveal>
        <DiagnosticReport results={results} />
      </Reveal>
    </CoursePageShell>
  );
}
