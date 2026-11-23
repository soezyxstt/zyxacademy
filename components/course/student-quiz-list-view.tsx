
import type { ReactNode } from "react";
import { ClipboardList } from "lucide-react";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { TabNav } from "@/components/ui/tabs";
import { TranslatedText } from "@/components/i18n/translated-text";

export type QuizAccessFilter = "all" | "free" | "premium";
export function StudentQuizListView({ href = (path: string) => path, id, courseTitle, access, children }: { href?: (path: string) => string; id: string; courseTitle: string; access: QuizAccessFilter; children: ReactNode }) {
  const filters: Array<{ value: QuizAccessFilter; label: string }> = [
    { value: "all", label: "all" },
    { value: "free", label: "free" },
    { value: "premium", label: "premium" },
  ];
  return (
    <CoursePageShell
      title={<TranslatedText namespace="learning" messageKey="quizPage.title" values={{ course: courseTitle }} />}
      icon={ClipboardList}
    >
      <TabNav
        tabs={filters.map((filter) => ({
          href: href(filter.value === "all" ? `/courses/${id}/quiz` : `/courses/${id}/quiz?access=${filter.value}`),
          label: <TranslatedText namespace="learning" messageKey={`quizPage.filters.${filter.label}`} />,
          active: access === filter.value,
        }))}
      />
      {children}
    </CoursePageShell>
  );
}
