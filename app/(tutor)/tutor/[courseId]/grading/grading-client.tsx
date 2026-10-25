"use client";

import { AdminEmptyState } from "@/components/admin/state-panels";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import { ArrowLeft, CheckCircle2, AlertCircle, FileText, Download, Award, Calendar, User, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { MathText } from "@/components/course/math-text";
import { toast } from "@/components/ui/toast";
import { gradeSubmissionAction } from "@/app/actions/tutor-management";

interface SubmissionItem {
  id: string;
  studentName: string | null;
  studentEmail: string | null;
  examTitle: string;
  status: "completed" | "pending_review" | "graded" | "late";
  score: number | null;
  teacherNotes: string | null;
  answersSnapshot: any;
  questionsSnapshot: any;
  submittedAt: Date | null;
}

interface Props {
  courseId: string;
  initialSubmissions: SubmissionItem[];
}

export function GradingClient({ courseId, initialSubmissions }: Props) {
  const router = useRouter();
  const tr = useTranslations("tutor.grading");
  const { locale } = useAppLocale();
  const dateLocale = locale === "id" ? "id-ID" : "en-US";
  const [isPending, startTransition] = useTransition();

  const [activeSub, setActiveSub] = useState<SubmissionItem | null>(null);
  const [scoreInput, setScoreInput] = useState("");
  const [notesInput, setNotesInput] = useState("");

  const pendingList = initialSubmissions.filter((s) => s.status === "pending_review");
  const gradedList = initialSubmissions.filter((s) => s.status === "graded");

  function handleOpenGrade(s: SubmissionItem) {
    setActiveSub(s);
    setScoreInput(s.score != null ? s.score.toString() : "");
    setNotesInput(s.teacherNotes || "");
  }

  async function handleSaveGrade() {
    if (!activeSub) return;
    const finalScore = parseInt(scoreInput, 10);

    if (isNaN(finalScore) || finalScore < 0 || finalScore > 100) {
      toast.error(tr("scoreInvalid"));
      return;
    }

    startTransition(async () => {
      try {
        const res = await gradeSubmissionAction(courseId, activeSub.id, finalScore, notesInput);
        if (res.success) {
          toast.success(tr("saved"));
          setActiveSub(null);
          router.refresh();
        }
      } catch {
        toast.error(tr("saveFailed"));
      }
    });
  }

  if (activeSub) {
    const qSnapshot = typeof activeSub.questionsSnapshot === "string" 
      ? JSON.parse(activeSub.questionsSnapshot) 
      : activeSub.questionsSnapshot || [];
    
    const aSnapshot = typeof activeSub.answersSnapshot === "string" 
      ? JSON.parse(activeSub.answersSnapshot) 
      : activeSub.answersSnapshot || {};

    return (
      <div className="space-y-4">
        {/* Detail Header */}
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setActiveSub(null)} className="rounded-md border-border/80">
            <ArrowLeft className="mr-1.5 size-4" />
            {tr("back")}
          </Button>
          <div>
            <h2 className="font-heading text-body-base font-bold text-foreground">{tr("answerSheet", { exam: activeSub.examTitle })}</h2>
            <p className="text-body-xs text-muted-foreground flex items-center gap-1">
              <User className="size-3" /> {activeSub.studentName} ({activeSub.studentEmail})
            </p>
          </div>
        </div>

        {/* Workspace Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Student Answers (8 cols) */}
          <div className="lg:col-span-8 space-y-4">
            {Array.isArray(qSnapshot) && qSnapshot.map((q: any, idx: number) => {
              const ans = aSnapshot[q.id];
              const isEssay = q.type === "essay";
              const isMc = q.type === "multiple_choice" || q.type === "multiple_choices";
              const isShort = q.type === "short_answer";

              return (
                <Card key={q.id} className="bg-card border border-border shadow-xs rounded-2xl p-5 space-y-4">
                  <div className="flex items-start gap-2.5">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-body-sm font-bold text-white shadow-xs font-mono">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] rounded-md text-muted-foreground capitalize">
                          {tr(q.type)}
                        </Badge>
                        {!isEssay && (
                          <Badge variant="secondary" className="text-[10px] rounded-md">
                            {tr("autoKey")}
                          </Badge>
                        )}
                      </div>
                      <MathText className="text-body-base font-medium text-foreground leading-relaxed pt-2" as="p">{q.prompt}</MathText>
                    </div>
                  </div>

                  {/* Options display for MC */}
                  {isMc && q.options && (
                    <div className="pl-9 grid gap-2 sm:grid-cols-2">
                      {q.options.map((opt: string, i: number) => {
                        const isStudentChoice = q.type === "multiple_choice"
                          ? ans?.index === i
                          : ans?.indices?.includes(i);
                        const isCorrect = q.type === "multiple_choice"
                          ? q.correctIndex === i
                          : q.correctIndices?.includes(i);

                        return (
                          <div key={i} className={`flex items-center gap-2 text-body-xs px-3 py-1.5 rounded-lg border ${
                            isStudentChoice && isCorrect ? "bg-emerald-500/5 border-emerald-500/25 text-emerald-700" :
                            isStudentChoice && !isCorrect ? "bg-rose-500/5 border-rose-500/25 text-rose-700" :
                            !isStudentChoice && isCorrect ? "bg-emerald-500/5 border-dashed border-emerald-500/20 text-muted-foreground" :
                            "bg-muted/10 border-border/50 text-muted-foreground"
                          }`}>
                            <span className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                              isStudentChoice && isCorrect ? "bg-emerald-500 text-white" :
                              isStudentChoice && !isCorrect ? "bg-rose-500 text-white" :
                              isCorrect ? "border border-emerald-500 text-emerald-500" :
                              "bg-muted text-muted-foreground"
                            }`}>
                              {String.fromCharCode(65 + i)}
                            </span>
                            <span className="truncate">
                              <MathText className="leading-normal" as="span">{opt}</MathText>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Short Answer Preview */}
                  {isShort && (
                    <div className="pl-9 space-y-2">
                      <div className="bg-muted/20 border border-border/60 rounded-xl p-3.5 text-body-sm">
                        <span className="text-[10px] font-semibold text-muted-foreground block uppercase">{tr("studentAnswer")}</span>
                        <p className="font-semibold text-foreground mt-0.5">
                          <MathText as="span">{ans?.text || "-"}</MathText>
                        </p>
                      </div>
                      <p className="text-body-xs text-muted-foreground">
                        {tr("correctAnswer")}{" "}
                        <span className="font-semibold text-foreground">
                          <MathText as="span">{(q.acceptableAnswers || []).join(" / ")}</MathText>
                        </span>
                      </p>
                    </div>
                  )}

                  {/* Essay Answer Preview */}
                  {isEssay && (
                    <div className="pl-9 space-y-3">
                      <div className="bg-muted/20 border border-border/60 rounded-xl p-4 text-body-sm leading-relaxed whitespace-pre-wrap">
                        <span className="text-[10px] font-semibold text-muted-foreground block uppercase mb-1">{tr("essayAnswer")}</span>
                        {ans?.text || <span className="text-muted-foreground italic">{tr("noEssayAnswer")}</span>}
                      </div>

                      {/* R2 uploaded attachment */}
                      {ans?.fileName && (
                        <div className="rounded-xl border border-border/80 bg-card p-3 flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-status-success/10 text-status-success">
                              <FileText className="size-5" />
                            </span>
                            <div className="min-w-0">
                              <p className="text-body-xs font-bold text-foreground truncate max-w-[200px] md:max-w-xs">{ans.fileName}</p>
                              <p className="text-[10px] text-muted-foreground">{ans.fileSize || tr("pdfImage")}</p>
                            </div>
                          </div>
                          {ans.fileKey ? (
                            <Button
                              variant="outline"
                              size="xs"
                              asChild
                              className="rounded-lg border-border/80 text-muted-foreground hover:text-foreground gap-1"
                            >
                              <a
                                href={`/api/storage/file/${ans.fileKey.split("/").map(encodeURIComponent).join("/")}?download=1`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <Download className="size-3.5" />
                                {tr("downloadFile")}
                              </a>
                            </Button>
                          ) : (
                            <span className="text-body-xs shrink-0 text-muted-foreground italic">
                              {tr("fileUnavailable")}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {/* Right Column: Grading Panel (4 cols) */}
          <div className="lg:col-span-4 sticky top-6 space-y-4">
            <Card className="bg-card border-border shadow-md rounded-2xl p-5">
              <CardHeader className="p-0 mb-4">
                <CardTitle className="font-heading text-body-base font-bold text-foreground flex items-center gap-2">
                  <Award className="size-5 text-brand-primary" />
                  {tr("gradingPanel")}
                </CardTitle>
                <p className="text-body-xs text-muted-foreground mt-0.5">
                  {tr("gradingDescription")}
                </p>
              </CardHeader>

              <div className="space-y-4 font-sans">
                <div className="grid gap-2">
                  <Label htmlFor="grade-score" className="text-body-sm font-semibold">{tr("finalScore")}</Label>
                  <Input
                    id="grade-score"
                    type="number"
                    value={scoreInput}
                    onChange={(e) => setScoreInput(e.target.value)}
                    placeholder={tr("scorePlaceholder")}
                    className="rounded-lg border-input bg-background font-sans text-body-sm font-semibold text-brand-primary focus-visible:ring-brand-primary"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="grade-notes" className="text-body-sm font-semibold">{tr("tutorFeedback")}</Label>
                  <Textarea
                    id="grade-notes"
                    value={notesInput}
                    onChange={(e) => setNotesInput(e.target.value)}
                    rows={6}
                    placeholder={tr("feedbackPlaceholder")}
                    className="rounded-lg border-input bg-background leading-relaxed text-body-sm focus-visible:ring-brand-primary"
                  />
                </div>
              </div>

              <div className="mt-6 space-y-2">
                <Button onClick={handleSaveGrade} isLoading={isPending} className="w-full bg-brand-primary text-white hover:bg-brand-primary/90 rounded-md font-semibold gap-1.5 shadow-sm">
                  {tr("savePublish")}
                </Button>
                <Button variant="outline" onClick={() => setActiveSub(null)} disabled={isPending} className="w-full rounded-md border-border/80">
                  {tr("cancel")}
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue="pending" className="w-full">
        <TabsList>
          <TabsTrigger value="pending">
            <AlertCircle className="size-4 mr-2 text-status-warning" />
            {tr("needsGrading")}
            <Badge variant="secondary" className="px-1.5 py-0 text-body-2xs">
              {pendingList.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="graded">
            <CheckCircle2 className="size-4 mr-2 text-status-success" />
            {tr("graded")}
          </TabsTrigger>
          <TabsTrigger value="all">
            <CheckSquare className="size-4 mr-2 text-muted-foreground" />
            {tr("all")}
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Pending */}
        <TabsContent value="pending">
          {pendingList.length === 0 ? (
            <AdminEmptyState icon={CheckCircle2} title={tr("allGraded")} />
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {pendingList.map((s) => (
                <Card key={s.id} className="rounded-none border-0 bg-transparent p-4 shadow-none flex flex-col sm:flex-row justify-between sm:items-center gap-3 hover:bg-muted/20 transition-colors">
                  <div className="space-y-1">
                    <h3 className="font-heading text-body-base font-semibold text-foreground">{s.examTitle}</h3>
                    <p className="text-body-sm text-muted-foreground flex items-center gap-1.5">
                      {tr("student")} <span className="font-medium text-foreground">{s.studentName}</span>
                    </p>
                    <p className="text-body-xs text-muted-foreground flex items-center gap-1.5">
                      <Calendar className="size-3.5" />
                      {s.submittedAt ? new Date(s.submittedAt).toLocaleString(dateLocale, { dateStyle: "medium", timeStyle: "short" }) : "-"}
                    </p>
                  </div>
                  <Button onClick={() => handleOpenGrade(s)} className="bg-brand-primary text-white hover:bg-brand-primary/90 rounded-md font-semibold text-body-sm">
                    {tr("gradeAnswer")}
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tab 2: Graded */}
        <TabsContent value="graded">
          {gradedList.length === 0 ? (
            <AdminEmptyState icon={AlertCircle} title={tr("noGraded")} />
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {gradedList.map((s) => (
                <Card key={s.id} className="rounded-none border-0 bg-transparent p-4 shadow-none flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                  <div className="space-y-1">
                    <h3 className="font-heading text-body-base font-semibold text-foreground">{s.examTitle}</h3>
                    <p className="text-body-sm text-muted-foreground">
                      {tr("student")} <span className="font-medium text-foreground">{s.studentName}</span>
                    </p>
                    <p className="text-body-xs text-muted-foreground flex items-center gap-1.5">
                      <Calendar className="size-3.5" />
                      {s.submittedAt ? new Date(s.submittedAt).toLocaleString(dateLocale, { dateStyle: "medium", timeStyle: "short" }) : "-"}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <p className="text-body-xs font-semibold text-muted-foreground uppercase">{tr("finalScoreLabel")}</p>
                      <p className="font-heading text-h6 font-bold text-brand-primary tabular-nums">{s.score}%</p>
                    </div>
                    <Button variant="outline" onClick={() => handleOpenGrade(s)} className="rounded-md border-border/80 text-muted-foreground hover:text-foreground">
                      {tr("editScore")}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tab 3: All */}
        <TabsContent value="all">
          {initialSubmissions.length === 0 ? (
            <AdminEmptyState icon={CheckSquare} title={tr("noSubmissions")} />
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {initialSubmissions.map((s) => (
                <Card key={s.id} className="rounded-none border-0 bg-transparent p-4 shadow-none flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                  <div className="space-y-1">
                    <h3 className="font-heading text-body-base font-semibold text-foreground">{s.examTitle}</h3>
                    <p className="text-body-sm text-muted-foreground">
                      {tr("student")} <span className="font-medium text-foreground">{s.studentName}</span>
                    </p>
                    <p className="text-body-xs text-muted-foreground flex items-center gap-1.5">
                      <Calendar className="size-3.5" />
                      {tr("status")}{" "}
                      <Badge variant="outline" className={`text-[10px] rounded-md ${
                        s.status === "graded" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                      }`}>
                        {s.status === "graded" ? tr("graded") : tr("waitingReview")}
                      </Badge>
                    </p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <p className="text-body-xs font-semibold text-muted-foreground uppercase font-sans">{tr("score")}</p>
                      <p className="font-heading text-h6 font-bold text-brand-primary tabular-nums">{s.score != null ? `${s.score}%` : tr("pending")}</p>
                    </div>
                    <Button onClick={() => handleOpenGrade(s)} className="bg-brand-primary text-white hover:bg-brand-primary/90 rounded-md font-semibold text-body-sm">
                      {s.status === "graded" ? tr("editScore") : tr("gradeAnswer")}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
