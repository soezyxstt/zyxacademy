"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AdminStatCard } from "@/components/admin/stat-card";
import {
  BarChart3,
  TrendingUp,
  Award,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  HelpCircle,
} from "lucide-react";
import { FormattedDate } from "@/components/ui/formatted-date";
import type { CourseQuiz } from "./quizzes-tab";

type Props = {
  courseId: string;
  courseTitle: string;
  quizzes: CourseQuiz[];
  stats: {
    totalAttempts: number;
    avgScore: number;
    passRate: number;
  };
};

export function AnalyticsTab({
  courseId: _courseId,
  courseTitle: _courseTitle,
  quizzes,
  stats,
}: Props) {
  const analyzedWithAiCount = quizzes.filter((q) => q.lastAiInsight !== null && q.lastAiInsight !== undefined).length;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminStatCard
          label="Total Pengerjaan Siswa"
          value={stats.totalAttempts}
          caption={`Pengerjaan selesai pada ${quizzes.length} kuis`}
          icon={TrendingUp}
          iconClassName="text-brand-primary"
        />
        <AdminStatCard
          label="Rata-rata Nilai"
          value={`${stats.avgScore} / 100`}
          caption="Rata-rata nilai pengerjaan siswa"
          icon={Award}
          iconClassName="text-brand-secondary"
        />
        <AdminStatCard
          label="Tingkat Kelulusan"
          value={`${stats.passRate}%`}
          caption="Proporsi siswa meraih nilai ≥ 70"
          icon={CheckCircle2}
          iconClassName="text-status-success"
        />
        <AdminStatCard
          label="Dianalisis AI Gemini"
          value={
            <>
              {analyzedWithAiCount}{" "}
              <span className="text-body-sm text-muted-foreground font-normal">/ {quizzes.length}</span>
            </>
          }
          caption="Kuis memiliki laporan insight"
          icon={Sparkles}
          iconClassName="text-brand-primary"
        />
      </div>

      {/* Per Quiz Performance Table */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/20 flex items-center justify-between">
          <h3 className="font-heading text-body-sm font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="size-4 text-brand-primary" />
            Evaluasi Hasil per Kuis &amp; Simulasi
          </h3>
        </div>

        {quizzes.length === 0 ? (
          <div className="text-center py-12 px-4">
            <HelpCircle className="size-8 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-body-sm font-medium text-foreground">Belum ada kuis untuk dianalisis</p>
            <p className="text-body-xs text-muted-foreground mt-1">
              Buat kuis terlebih dahulu pada tab Kuis &amp; Asesmen untuk mulai mengumpulkan data pengerjaan siswa.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-body-sm">
              <thead className="bg-muted text-body-xs font-semibold text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Nama Kuis / Ujian</th>
                  <th className="px-4 py-3">Kategori</th>
                  <th className="px-4 py-3 text-center">Pengerjaan</th>
                  <th className="px-4 py-3 text-center">Rata-rata Nilai</th>
                  <th className="px-4 py-3 text-center">Kelulusan</th>
                  <th className="px-4 py-3">Status Insight AI</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {quizzes.map((quiz) => (
                  <tr key={quiz.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3.5 font-medium text-foreground">
                      <p className="font-semibold">{quiz.title}</p>
                      <p className="text-body-xs text-muted-foreground">ID: {quiz.id}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge variant="secondary" className="rounded-md text-[11px] capitalize font-medium">
                        {quiz.category}
                      </Badge>
                    </td>
                    <td className="px-4 py-3.5 text-center font-medium">
                      {quiz.totalAttempts || 0} siswa
                    </td>
                    <td className="px-4 py-3.5 text-center font-semibold">
                      {(quiz.totalAttempts || 0) > 0 ? (
                        <span className={(quiz.avgScore || 0) >= 70 ? "text-status-success" : "text-status-warning"}>
                          {quiz.avgScore || 0} / 100
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-body-xs">Belum ada</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-center font-medium">
                      {(quiz.totalAttempts || 0) > 0 ? (
                        <span>{quiz.passRate || 0}%</span>
                      ) : (
                        <span className="text-muted-foreground text-body-xs">Belum ada</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {quiz.lastAiInsight ? (
                        <div className="flex items-center gap-1.5 text-status-success text-body-xs font-medium">
                          <CheckCircle2 className="size-3.5 shrink-0" />
                          <span>
                            Dianalisis (<FormattedDate date={quiz.lastAiInsight.createdAt} options={{ day: "numeric", month: "short" }} />)
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-muted-foreground text-body-xs">
                          <Sparkles className="size-3 text-muted-foreground/60 shrink-0" />
                          <span>Belum dianalisis</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <Link href={`/admin/ai/quiz-insights/${quiz.id}`}>
                        <Button
                          size="sm"
                          variant={quiz.lastAiInsight ? "default" : "outline"}
                          className="gap-1.5 rounded-lg text-body-xs"
                        >
                          <span>Lihat Laporan</span>
                          <ArrowRight className="size-3.5" />
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
