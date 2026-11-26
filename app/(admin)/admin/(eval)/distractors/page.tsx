import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";
import { readDistractors } from "./distractors-read-model";
import { assertTutorOrAdmin } from "@/lib/auth/admin-guards-server";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { AdminPageHeader } from "@/components/admin/page-header";
import { MathText } from "@/components/course/math-text";
import { Target } from "lucide-react";
import { TranslatedText } from "@/components/i18n/translated-text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminEval");
  return { title: pageTitle(t("metadata.distractors")) };
}

export default async function DistractorAnalyticsPage() {
  const { user } = await assertTutorOrAdmin();

  const questions = await readDistractors(user.id);

  return (
    <div className="space-y-5">
      <AdminPageHeader
        icon={Target}
        title={<TranslatedText namespace="adminEval" messageKey="routes.distractors" />}
      />
      {questions.length === 0 ? (
        <AdminEmptyState icon={Target} title={<TranslatedText namespace="adminEval" messageKey="distractors.emptyTitle" />} description={<TranslatedText namespace="adminEval" messageKey="distractors.emptyDescription" />} />
      ) : (
        <div className="divide-y divide-border/60 border-y border-border/60">
          {questions.map(({ id, prompt, course, total, options }) => {
            return (
              <section key={id} className="space-y-(--compact-gap) py-(--related-gap)">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <MathText className="block min-w-0 wrap-break-word text-body-base font-semibold text-foreground" as="div">{prompt}</MathText>
                  <span className="shrink-0 text-body-sm text-muted-foreground">
                    {total} <TranslatedText namespace="adminEval" messageKey="distractors.answers" />
                  </span>
                </div>
                <p className="text-body-xs text-muted-foreground">{course}</p>
                <div className="space-y-2">
                  {options.map(({ text, percentage, isCorrect, misconception }, idx) => {
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex items-center justify-between gap-3 text-body-sm">
                          <MathText className={isCorrect ? "font-semibold text-status-success" : "text-foreground"} as="span">
                            {text}
                          </MathText>
                          <span className="shrink-0 tabular-nums text-muted-foreground">{percentage}%</span>
                        </div>
                        <div className="h-1.5 rounded-md bg-muted">
                          <div
                            className={`h-full rounded-md transition-[width] duration-500 ease-out ${isCorrect ? "bg-status-success" : "bg-primary"}`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        {misconception !== null && (
                          <p className="text-body-xs text-foreground"><TranslatedText namespace="adminEval" messageKey="distractors.misconception" /> {misconception}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
