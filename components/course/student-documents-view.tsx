import type { ReactNode } from "react";
import { FileText } from "lucide-react";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { Reveal } from "@/components/ui/reveal";
import { TranslatedText } from "@/components/i18n/translated-text";

export function StudentDocumentsView({ courseTitle, children }: { courseTitle: string; children: ReactNode }) {
  return <CoursePageShell title={<TranslatedText namespace="learning" messageKey="materialPage.title" values={{ course: courseTitle }} />} icon={FileText}>
    <Reveal>{children}</Reveal>
  </CoursePageShell>;
}
