import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { createMetadata } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";
import { TranslatedText } from "@/components/i18n/translated-text";
import { PKA_SUBJECTS } from "@/lib/pka-config";
import { getDiagnosticSummary } from "@/lib/pka-simulation";
import { requirePkaSession } from "@/lib/pka-enrollment";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { DiagnosticReport } from "@/components/pka/diagnostic-report";
import { Reveal } from "@/components/ui/reveal";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("studentExtras.pka");
  return createMetadata({ title: t("reportTitle"), description: t("reportDescription"), path: "/courses/tutorial-pka/laporan" });
}


export default async function PkaLaporanPage() {
  const userId = await requirePkaSession("/courses/tutorial-pka/laporan");
  const results = await getDiagnosticSummary(userId, PKA_SUBJECTS);

  return (
    <CoursePageShell
      title={<TranslatedText namespace="studentExtras.pka" messageKey="reportPageTitle" />}

      icon={BarChart3}
    >
      <Reveal>
        <DiagnosticReport results={results} />
      </Reveal>
    </CoursePageShell>
  );
}
