
import type { ReactNode } from "react";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { tabListClassName, tabTriggerClassName, tabTriggerActiveClassName } from "@/components/ui/tab-styles";
import { TranslatedText } from "@/components/i18n/translated-text";
import { cn } from "@/lib/utils";

export type QuizAccessFilter = "all" | "free" | "premium";
export function StudentQuizListView({ href = (path: string) => path,  id, courseTitle, access, children }: { href?: (path: string) => string;  id: string; courseTitle: string; access: QuizAccessFilter; children: ReactNode }) {

  const filters: Array<{value: QuizAccessFilter; label: string}> = [{value:"all",label:"all"},{value:"free",label:"free"},{value:"premium",label:"premium"}];
  return (
    <CoursePageShell
      title={<TranslatedText namespace="learning" messageKey="quizPage.title" values={{ course: courseTitle }} />}
      icon={ClipboardList}
      actions={(
        <nav className={tabListClassName} aria-labelledby="quiz-access-filter-label">
          <span id="quiz-access-filter-label" className="sr-only"><TranslatedText namespace="learning" messageKey="quizPage.filterLabel" /></span>
          {filters.map((filter) => (
            <Link
              key={filter.value}
              href={href(filter.value === "all" ? `/courses/${id}/quiz` : `/courses/${id}/quiz?access=${filter.value}`)}
              className={cn(
                tabTriggerClassName,
                access === filter.value && tabTriggerActiveClassName,
              )}
              aria-current={access === filter.value ? "page" : undefined}
            >
              <TranslatedText namespace="learning" messageKey={`quizPage.filters.${filter.label}`} />
            </Link>
          ))}
        </nav>
      )}
    >
      {children}
    </CoursePageShell>
  );
}
