import type { ReactNode } from "react";
import { GraduationCap } from "lucide-react";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { TranslatedText } from "@/components/i18n/translated-text";

export function StudentTryoutsView({ courseTitle, children }: { courseTitle: string; children: ReactNode }) {
  return <CoursePageShell title={<TranslatedText namespace="learning" messageKey="tryoutPage.title" values={{ course: courseTitle }} />} icon={GraduationCap}>
    {children}
  </CoursePageShell>;
}
