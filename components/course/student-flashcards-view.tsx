import type { ReactNode } from "react";
import { Brain } from "lucide-react";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { TranslatedText } from "@/components/i18n/translated-text";

export function StudentFlashcardsView({ courseTitle, children }: { courseTitle: string; children: ReactNode }) {
  return <CoursePageShell title={<TranslatedText namespace="learning" messageKey="flashcards.pageTitle" values={{ course: courseTitle }} />} icon={Brain}>
    {children}
  </CoursePageShell>;
}
