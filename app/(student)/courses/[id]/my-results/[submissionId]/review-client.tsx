"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, HelpCircle, X, Lock, Sparkles, Video, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MathText } from "@/components/course/math-text";
import { getYoutubeEmbedUrl } from "@/lib/youtube";
import { useTutor } from "@/components/course/tutor-drawer";
import type { SubmissionReviewFixture, SubmissionListItem } from "@/lib/student-course-fixtures";

type ReviewClientProps = {
  courseId: string;
  listItem: SubmissionListItem;
  review: SubmissionReviewFixture;
};

export function ReviewClient({ listItem, review }: ReviewClientProps) {
  const { openMistake } = useTutor();
  const [userPlan, setUserPlan] = useState<string>("essential");

  const loadPlan = () => {
    setUserPlan(localStorage.getItem("zyx-user-plan") || "essential");
  };

  useEffect(() => {
    const timer = window.setTimeout(loadPlan, 0);

    // Listen to simulator plan updates
    window.addEventListener("zyx-plan-changed", loadPlan);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("zyx-plan-changed", loadPlan);
    };
  }, []);

  const isVideoUnlocked = userPlan === "essential" || userPlan === "premium";

  return (
    <div className="space-y-6 font-sans">
      
      {/* Overview stats */}
      <div className="rounded-2xl border border-border bg-card/60 p-5 flex flex-wrap items-center justify-between gap-4 backdrop-blur-xs">
        <div>
          <span className="text-body-xs font-semibold text-muted-foreground uppercase">Status Pengerjaan</span>
          <h2 className="font-heading text-body-base font-bold text-foreground mt-0.5">
            {review.examTitle}
          </h2>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-left md:text-right">
            <span className="text-body-xs font-semibold text-muted-foreground uppercase">Skor Akhir</span>
            <p className="font-heading text-h4 font-bold text-foreground">
              {listItem.score != null ? `${listItem.score}%` : "Pending"}
            </p>
          </div>
          <div className="text-left md:text-right">
            <span className="text-body-xs font-semibold text-muted-foreground uppercase">Paket Aktif</span>
            <p className="text-body-xs font-bold text-brand-primary uppercase mt-1">
              ⭐ {userPlan}
            </p>
          </div>
        </div>
      </div>

      <ol className="space-y-6">
        {review.items.map((item, idx) => {
          const hasExplanation = item.explanationText || item.explanationImage || item.explanationVideoUrl;

          return (
            <li
              key={item.questionId}
              className="rounded-3xl border border-border/80 bg-card p-6 shadow-sm backdrop-blur-xs md:p-8"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="font-heading text-body-md font-bold text-foreground md:text-h6 max-w-xl leading-snug">
                  <span className="text-muted-foreground mr-1">{idx + 1}.</span>
                  <MathText>{item.prompt}</MathText>
                </h3>
                
                {/* Answer Correctness Badges */}
                {item.correct === true ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-status-success/12 px-2.5 py-0.5 text-body-xs font-semibold text-status-success ring-1 ring-status-success/20">
                    <Check className="size-3.5" aria-hidden /> Benar
                  </span>
                ) : item.correct === false ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-status-error/12 px-2.5 py-0.5 text-body-xs font-semibold text-status-error ring-1 ring-status-error/20">
                    <X className="size-3.5" aria-hidden /> Salah
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-md bg-status-warning/12 px-2.5 py-0.5 text-body-xs font-semibold text-status-warning ring-1 ring-status-warning/20">
                    <HelpCircle className="size-3.5" aria-hidden /> Menunggu Dinilai
                  </span>
                )}
              </div>

              {/* User answer and key details */}
              <div className="mt-5 space-y-2 text-body-sm border-l-2 border-muted pl-4">
                <p>
                  <span className="font-semibold text-muted-foreground">Jawaban Anda: </span>
                  <MathText className="text-foreground font-medium">{item.userAnswer || "-"}</MathText>
                </p>
                {item.correctAnswerLabel && (
                  <p>
                    <span className="font-semibold text-muted-foreground">Jawaban Benar: </span>
                    <MathText className="text-status-success font-semibold">{item.correctAnswerLabel}</MathText>
                  </p>
                )}
                {item.teacherNote && (
                  <div className="mt-3 rounded-xl bg-muted/40 border border-border p-3 text-body-xs text-foreground leading-relaxed">
                    <span className="font-bold text-brand-secondary">Catatan Pengajar: </span>
                    <MathText>{item.teacherNote}</MathText>
                  </div>
                )}
                {item.correct === false && (
                  <div className="pt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openMistake(item.questionId, item.userAnswer || "")}
                      className="text-body-xs font-semibold flex items-center gap-1.5 border-brand-primary/30 text-brand-primary hover:bg-brand-primary/5 rounded-lg h-9"
                    >
                      <Sparkles className="size-3.5" />
                      Tanya Zyra: Analisis Kesalahan
                    </Button>
                  </div>
                )}
              </div>

              {/* Zyra-Generated Discussion and Explanation Section */}
              {hasExplanation && (
                <div className="mt-6 border-t border-border/80 pt-6 space-y-4">
                  <div className="flex items-center gap-2 text-brand-primary">
                    <Sparkles className="size-4 animate-pulse" />
                    <h4 className="font-heading text-body-xs font-bold uppercase tracking-wider">Pembahasan Soal oleh Zyra</h4>
                  </div>

                  {/* Text-based explanation */}
                  {item.explanationText && (
                    <MathText as="p" className="text-body-sm text-muted-foreground leading-relaxed">
                      {item.explanationText}
                    </MathText>
                  )}

                  {/* Image/Diagram explanation */}
                  {item.explanationImage && (
                    <div className="relative mx-auto max-w-md aspect-video border border-border rounded-2xl overflow-hidden mt-3 shadow-xs">
                      <Image
                        src={item.explanationImage}
                        alt={`Diagram Pembahasan Soal ${idx + 1}`}
                        fill
                        className="object-cover"
                      />
                      <div className="bg-muted/70 px-3 py-1.5 text-[10px] text-center text-muted-foreground border-t border-border font-medium">
                        Gambar: Ilustrasi Grafik Penyelesaian Matematika
                      </div>
                    </div>
                  )}

                  {/* Video-based explanation (Premium Tier Locked) */}
                  {item.explanationVideoUrl && (
                    <div className="space-y-2 mt-4">
                      <span className="text-body-xs font-bold text-foreground flex items-center gap-1.5">
                        <Video className="size-3.5 text-brand-primary" />
                        Video Pembahasan Tutor:
                      </span>

                      <div className="relative w-full max-w-xl aspect-video rounded-2xl border border-border bg-black overflow-hidden shadow-md">
                        {isVideoUnlocked ? (
                          /* Render actual video players if unlocked */
                          item.explanationVideoKind === "youtube" ? (
                            (() => {
                              const embed = getYoutubeEmbedUrl(item.explanationVideoUrl);
                              return embed ? (
                                <iframe
                                  title={`Video Pembahasan Soal ${idx + 1}`}
                                  src={embed}
                                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                  allowFullScreen
                                  className="w-full h-full border-0"
                                />
                              ) : (
                                <p className="text-body-sm text-white p-4">Embed video gagal dimuat.</p>
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
                              <h5 className="font-heading text-body-sm font-bold text-white">Video Pembahasan Terkunci</h5>
                              <p className="text-[10px] text-muted-foreground mt-1 max-w-sm leading-relaxed">
                                Fitur video pembahasan tutor ini hanya tersedia untuk paket langganan <b>Essential</b> atau <b>Premium</b>.
                              </p>
                              <Button
                                asChild
                                size="sm"
                                className="mt-4 bg-brand-secondary hover:bg-brand-secondary/95 text-white text-body-xs font-semibold h-8"
                              >
                                <Link href="/plans">
                                  Tingkatkan Paket Sekarang
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
            </li>
          );
        })}
      </ol>
    </div>
  );
}
