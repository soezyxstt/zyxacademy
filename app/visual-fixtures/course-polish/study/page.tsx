import { notFound } from "next/navigation";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { TranslatedText } from "@/components/i18n/translated-text";
import { DiagnosticReport } from "@/components/pka/diagnostic-report";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import { CoursePolishFixture } from "../course-polish-fixture";
import { CoursePolishShell } from "../course-polish-shell";

export default async function Page({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { section } = await searchParams;
  if (!section) notFound();
  if (section === "diagnostic") {
    return (
      <CoursePolishShell course={{ id: PKA_COURSE_ID, title: "Tutorial PKA" }} section="laporan">
        <CoursePageShell title={<TranslatedText namespace="studentExtras.pka" messageKey="reportPageTitle" />}>
          <DiagnosticReport results={[
            { subject: "matematika", attempted: true, passedAtStage: null, bestScore: 0, status: "at_risk", message: "" },
            { subject: "fisika", attempted: true, passedAtStage: null, bestScore: 52, status: "not_attempted", message: "" },
            { subject: "kimia", attempted: true, passedAtStage: 1, bestScore: 90, status: "solid", message: "" },
          ]} />
        </CoursePageShell>
      </CoursePolishShell>
    );
  }
  const activityTimestamp = new Date(Date.now() - 90 * 60 * 1000).toISOString();
  return <CoursePolishFixture section={section} activityTimestamp={activityTimestamp} />;
}
