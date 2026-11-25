"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, HelpCircle, X, Lock, Video, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MathText } from "@/components/course/math-text";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { getYoutubeEmbedUrl } from "@/lib/youtube";
import { useTutor } from "@/components/course/tutor-drawer";
import type { SubmissionReviewFixture, SubmissionListItem } from "@/lib/student-course-fixtures";
import { QuestionSourceCitation } from "@/components/course/question-source-citation";
import { useTranslations } from "@/lib/i18n/client";

import { useStudentExperience } from "@/components/student-experience-provider";

type ReviewClientProps = {
  courseId: string;
  listItem: SubmissionListItem;
  review: SubmissionReviewFixture;
};

export function ReviewClient({ listItem, review }: ReviewClientProps) {
  const t = useTranslations("learning");
  const experience = useStudentExperience();
  const { openMistake } = useTutor();
  const [userPlan, setUserPlan] = useState<string>("essential");

  const loadPlan = () => {
    try { setUserPlan(localStorage.getItem("zyx-user-plan") || "essential"); } catch { setUserPlan("essential"); }
  };

  useEffect(() => {
    if (experience.mode === "demo") return;
    const timer = window.setTimeout(loadPlan, 0);

    // Listen to simulator plan updates
    window.addEventListener("zyx-plan-changed", loadPlan);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("zyx-plan-changed", loadPlan);
    };
  }, [experience.mode]);

  const isVideoUnlocked = userPlan === "essential" || userPlan === "premium";

  return (
    <div className="space-y-(--section-gap) font-sans">

      {/* Overview stats */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/55 pb-(--row-padding)">
        <div className="min-w-0">
          <h2 className="wrap-anywhere font-heading text-body-base font-bold text-foreground">
            {review.examTitle}
          </h2>
        </div>
        <div className="flex flex-wrap items-start gap-(--related-gap)">
          <div className="text-left md:text-right">
            <span className="text-body-xs text-muted-foreground">{t("review.finalScore")}</span>
            <p className="text-body-sm font-semibold tabular-nums text-foreground">
              {listItem.score != null ? `${listItem.score}%` : t("review.pending")}
            </p>
          </div>
          <div className="text-left md:text-right">
            <span className="text-body-xs text-muted-foreground">{t("review.activePlan")}</span>
            <p className="text-body-sm font-medium capitalize text-foreground">
              {userPlan}
            </p>
          </div>
        </div>
      </div>

      <ol className="divide-y divide-border/60">
        {review.items.map((item, idx) => {
          const hasExplanation = item.explanationText || item.explanationImage || item.explanationVideoUrl;

          return (
            <li
              key={item.questionId}
              className="py-(--group-gap) first:pt-0"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1 text-body-base font-medium text-foreground leading-snug">
                  <h3 className="font-heading text-body-sm font-bold text-muted-foreground">{idx + 1}.</h3>
                  <MarkdownRenderer content={item.prompt} />
                </div>

                {/* Answer Correctness Badges */}
                {item.correct === true ? (
                  <span className="inline-flex items-center gap-1 text-body-xs font-semibold text-status-success">
                    <Check className="size-3.5" aria-hidden /> {t("review.correct")}
                  </span>
                ) : item.correct === false ? (
                  <span className="inline-flex items-center gap-1 text-body-xs font-semibold text-status-error">
                    <X className="size-3.5" aria-hidden /> {t("review.incorrect")}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-body-xs font-semibold text-status-warning">
                    <HelpCircle className="size-3.5" aria-hidden /> {t("review.pendingReview")}
                  </span>
                )}
              </div>

              {/* User answer and key details */}
              <div className="mt-(--related-gap) space-y-1.5 border-l-2 border-border/60 pl-3 text-body-sm">
                <p>
                  <span className="font-semibold text-muted-foreground">{t("review.yourAnswer")} </span>
                  <MathText className="text-foreground font-medium">{item.userAnswer || "-"}</MathText>
                </p>
                {item.correctAnswerLabel && (
                  <p>
                    <span className="font-semibold text-muted-foreground">{t("review.correctAnswer")} </span>
                    <MathText className="text-status-success font-semibold">{item.correctAnswerLabel}</MathText>
                  </p>
                )}
                {item.teacherNote && (
                  <div className="mt-3 border-l-2 border-border pl-3 text-body-xs leading-relaxed text-foreground">
                    <span className="font-bold text-brand-secondary">{t("review.teacherNote")} </span>
                    <MathText>{item.teacherNote}</MathText>
                  </div>
                )}
                {item.correct === false && (
                  <div className="pt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openMistake(item.questionId, item.userAnswer || "")}
                      className="text-body-sm font-semibold flex items-center gap-1.5 border-brand-primary/30 text-brand-primary hover:bg-brand-primary/5 rounded-lg h-9"
                    >
                      {t("review.askZyra")}
                    </Button>
                  </div>
                )}
              </div>

              {/* Zyra-Generated Discussion and Explanation Section */}
              {hasExplanation && (
                <div className="mt-(--related-gap) space-y-(--related-gap) border-t border-border/55 pt-(--related-gap)">
                  <h4 className="font-heading text-body-xs font-bold uppercase tracking-wider text-foreground">{t("review.explanation")}</h4>

                  {/* Text-based explanation */}
                  {item.explanationText && (
                    <MarkdownRenderer content={item.explanationText} className="text-body-sm text-muted-foreground leading-relaxed" />
                  )}

                  {/* Image/Diagram explanation */}
                  {item.explanationImage && (
                    <div className="relative mx-auto max-w-md aspect-video border border-border rounded-2xl overflow-hidden mt-3 shadow-xs">
                      <Image
                        src={item.explanationImage}
                        unoptimized
                        alt={t("review.diagramAlt", { number: idx + 1 })}
                        fill
                        className="object-cover"
                      />
                      <div className="bg-muted/70 px-3 py-1.5 text-body-xs text-center text-muted-foreground border-t border-border font-medium">
                        {t("review.diagramCaption")}
                      </div>
                    </div>
                  )}

                  {/* Video-based explanation (Premium Tier Locked) */}
                  {item.explanationVideoUrl && (
                    <div className="space-y-2 mt-4">
                      <span className="text-body-xs font-bold text-foreground flex items-center gap-1.5">
                        <Video className="size-3.5 text-brand-primary" />
                        {t("review.tutorVideo")}
                      </span>

                      <div className="relative w-full max-w-xl aspect-video rounded-2xl border border-border bg-black overflow-hidden shadow-md">
                        {isVideoUnlocked ? (
                          /* Render actual video players if unlocked */
                          item.explanationVideoKind === "youtube" ? (
                            (() => {
                              const embed = getYoutubeEmbedUrl(item.explanationVideoUrl);
                              return embed ? (
                                <iframe
                                  title={t("review.videoTitle", { number: idx + 1 })}
                                  src={embed}
                                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                  allowFullScreen
                                  className="w-full h-full border-0"
                                />
                              ) : (
                                <p className="text-body-sm text-white p-4">{t("review.videoLoadFailed")}</p>
                              );
                            })()
                          ) : (
                            /* HTML5 Video Player from Cloudflare R2 */
                            <video
                              src={item.explanationVideoUrl}
                              controls
                              className="w-full h-full"
                              poster="https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=600&q=80"
                            />
                          )
                        ) : (
                          /* Premium Locked overlay */
                          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center select-none">
                            {/* Blurred background image mock */}
                            <div className="absolute inset-0 bg-cover bg-center filter blur-md opacity-25" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=600&q=80')" }} />

                            {/* Lock UI Content */}
                            <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center p-4">
                              <span className="flex size-11 items-center justify-center rounded-full bg-brand-secondary/20 text-brand-secondary mb-3 border border-brand-secondary/35">
                                <Lock className="size-5" />
                              </span>
                              <h5 className="font-heading text-body-sm font-bold text-white">{t("review.lockedVideoTitle")}</h5>
                              <p className="mt-1 max-w-sm text-body-xs leading-relaxed text-white/80">
                                {t("review.lockedVideoDescription")}
                              </p>
                              <Button
                                asChild
                                size="sm"
                                className="mt-4 bg-brand-secondary hover:bg-brand-secondary/95 text-white text-body-sm font-semibold h-9"
                              >
                                <Link href="/plans">
                                  {t("review.upgradePlan")}
                                  <ExternalLink className="ml-1 size-3" />
                                </Link>
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                </div>
              )}
              <QuestionSourceCitation origin={item.origin} sourceEventName={item.sourceEventName} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
