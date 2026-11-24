import Link from "next/link";
import { MathText } from "@/components/course/math-text";
import { TranslatedText } from "@/components/i18n/translated-text";

export function StudentCourseProgressRow({ href, category, title, doneCount, total, nextConcept }: { href: string; category: string; title: string; doneCount: number; total: number; nextConcept?: string | null }) {
  const progressPct = total > 0 ? Math.round(doneCount / total * 100) : 0;
  return (
                          <Link
                            href={href}
                            className="group block py-3.5 px-2 -mx-2 rounded-xl transition-colors hover:bg-muted/40"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                {/* Category Badge + Title */}
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="inline-flex rounded-md bg-brand-primary/10 px-2 py-0.5 text-body-2xs font-bold text-brand-primary uppercase tracking-wider ring-1 ring-brand-primary/20 shrink-0">
                                    {category}
                                  </span>
                                  <h3 className="font-heading text-body-sm font-bold text-foreground break-words min-w-0">
                                    {title}
                                  </h3>
                                </div>

                                {/* Sleek inline progress */}
                                <div className="mt-2.5 flex flex-wrap items-center gap-2 sm:gap-3 max-w-md">
                                  <div className="h-1.5 w-20 sm:w-28 shrink-0 overflow-hidden rounded bg-muted">
                                    <div
                                      className="h-full bg-brand-primary transition-all duration-300 rounded"
                                      style={{ width: `${progressPct}%` }}
                                    />
                                  </div>
                                  <span className="text-body-xs font-semibold text-foreground shrink-0">{progressPct}%</span>
                                  <span className="text-body-xs text-muted-foreground"><TranslatedText namespace="student" messageKey="dashboard.enrolledMaterialProgress" values={{ done: doneCount, total: total }} /></span>
                                </div>

                                {nextConcept && (
                                  <div className="mt-2 text-body-xs font-medium text-muted-foreground break-words min-w-0">
                                    <TranslatedText namespace="student" messageKey="dashboard.nextStep" />{" "}
                                    <span className="text-foreground font-medium group-hover:underline">
                                      <MathText as="span">{nextConcept}</MathText>
                                    </span>
                                  </div>
                                )}
                              </div>

                            </div>
                          </Link>
  );
}
