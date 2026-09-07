"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  BarChart3,
  BrainCircuit,
  BookOpen,
  ArrowRight,
  TrendingUp,
  CheckCircle2,
  HelpCircle,
  RefreshCw,
  Award,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FormattedDate } from "@/components/ui/formatted-date";
import { SearchBar } from "@/components/ui/search-bar";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { AdminTable, AdminTableHead } from "@/components/admin/table";
import { cn } from "@/lib/utils";

export interface QuizInsightOverviewItem {
  type: "quiz_template";
  id: string;
  title: string;
  category: "daily" | "weekly" | "chapter" | "premium" | "simulation";
  courseId: string;
  courseName: string;
  status: string;
  timeLimitSeconds: number | null;
  createdAt: string;
  totalAttempts: number;
  avgScore: number;
  passRate: number;
  lastAiInsight: {
    id: string;
    createdAt: string;
    sampleSize: number;
  } | null;
}

export interface LockedCourseAnalyticsInfo {
  id: string;
  slug: string;
  title: string;
  compatibleCourseIds?: string[];
}

export interface QuizInsightsListClientProps {
  lockedCourse?: LockedCourseAnalyticsInfo;
  detailHrefPrefix?: string;
  backHref?: string;
  backLabel?: string;
  hideHeader?: boolean;
}

export function QuizInsightsListClient({
  lockedCourse,
  detailHrefPrefix = "/admin/quiz-insights",
  backHref,
  backLabel,
  hideHeader = Boolean(lockedCourse),
}: QuizInsightsListClientProps = {}) {
  const [items, setItems] = useState<QuizInsightOverviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCourse, setSelectedCourse] = useState(lockedCourse ? lockedCourse.id : "all");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (lockedCourse) {
        params.set("courseId", lockedCourse.id);
      }
      const url = `/api/admin/quiz-insights${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch (err) {
      console.error("Gagal mengambil data ringkasan kuis:", err);
    } finally {
      setLoading(false);
    }
  }, [lockedCourse]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Filter items locally
  const filteredItems = items.filter((item) => {
    const matchSearch =
      !search ||
      item.title.toLowerCase().includes(search.toLowerCase()) ||
      item.courseName.toLowerCase().includes(search.toLowerCase());
    const matchCourse = lockedCourse || selectedCourse === "all" || item.courseId === selectedCourse;
    const matchCategory = selectedCategory === "all" || item.category === selectedCategory;
    return matchSearch && matchCourse && matchCategory;
  });

  // Extract unique courses for filter
  const uniqueCourses = Array.from(
    new Map(items.map((i) => [i.courseId, i.courseName || i.courseId])).entries()
  );

  // High-level KPI metrics
  const totalQuizzes = filteredItems.length;
  const totalAttemptsSum = filteredItems.reduce((acc, curr) => acc + curr.totalAttempts, 0);
  const avgOverallScore =
    filteredItems.length > 0
      ? Math.round(filteredItems.reduce((acc, curr) => acc + curr.avgScore, 0) / filteredItems.length)
      : 0;
  const analyzedWithAiCount = filteredItems.filter((i) => i.lastAiInsight !== null).length;

  return (
    <div className="space-y-4">
      {hideHeader ? null : lockedCourse ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2">
              <BarChart3 className="size-4 text-brand-primary" />
              <span>Analitik Kuis Mata Kuliah</span>
            </h2>
            <p className="text-body-xs text-muted-foreground">
              Evaluasi performa kuis, distraktor jebakan, dan insight AI untuk {lockedCourse.title}.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchItems}
            disabled={loading}
            className="gap-2 rounded-lg text-body-sm"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            <span>Perbarui Data</span>
          </Button>
        </div>
      ) : (
        <AdminPageHeader
          icon={BarChart3}
          title="Analisis & Insight Kuis / Exam"
          description="Halaman khusus evaluasi performa kuis, simulasi, dan asesmen. Temukan konsep yang menyulitkan, distraktor jebakan, serta rekomendasi pengajaran untuk tutor."
          backHref={backHref}
          backLabel={backLabel}
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={fetchItems}
              disabled={loading}
              className="gap-2 rounded-lg text-body-sm"
            >
              <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
              <span>Perbarui Data</span>
            </Button>
          }
        />
      )}

      {/* KPI Strip */}
      <AdminStatStrip className="lg:grid-cols-4">
        <AdminStatStripItem
          label="Total Kuis & Simulasi"
          value={totalQuizzes}
          caption={lockedCourse ? `Mata kuliah ${lockedCourse.title}` : "Terdaftar di sistem Zyx"}
          icon={BookOpen}
          iconClassName="text-brand-primary"
        />
        <AdminStatStripItem
          label="Total Pengerjaan"
          value={totalAttemptsSum}
          caption="Pengerjaan selesai oleh siswa"
          icon={TrendingUp}
          iconClassName="text-status-info"
        />
        <AdminStatStripItem
          label="Rata-rata Nilai"
          value={`${avgOverallScore} / 100`}
          caption="Rata-rata dari kuis terpilih"
          icon={Award}
          iconClassName="text-brand-secondary"
        />
        <AdminStatStripItem
          label="Dianalisis"
          value={
            <>
              {analyzedWithAiCount}{" "}
              <span className="text-body-xs text-muted-foreground font-normal">/ {totalQuizzes}</span>
            </>
          }
          caption="Kuis memiliki laporan insight"
          icon={BrainCircuit}
          iconClassName="text-brand-primary"
        />
      </AdminStatStrip>

      {/* Filter and Search Bar */}
      <div className="flex flex-row flex-wrap items-center gap-2">
        <SearchBar
          size="sm"
          placeholder={
            lockedCourse
              ? "Cari berdasarkan judul kuis..."
              : "Cari berdasarkan judul kuis atau mata kuliah..."
          }
          value={search}
          onSearch={setSearch}
          onClear={() => setSearch("")}
          containerClassName="flex-1 min-w-[140px]"
        />

        {!lockedCourse && (
          <Select value={selectedCourse} onValueChange={setSelectedCourse}>
            <SelectTrigger className="w-[160px] sm:w-[180px] h-9 text-body-sm rounded-lg shrink-0">
              <SelectValue placeholder="Mata Kuliah" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Mata Kuliah</SelectItem>
              {uniqueCourses.map(([cId, cName]) => (
                <SelectItem key={cId} value={cId}>
                  {cName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-[140px] sm:w-[160px] h-9 text-body-sm rounded-lg shrink-0">
            <SelectValue placeholder="Kategori Kuis" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Kategori</SelectItem>
            <SelectItem value="daily">Daily Quiz</SelectItem>
            <SelectItem value="weekly">Weekly Quiz</SelectItem>
            <SelectItem value="chapter">Chapter Quiz</SelectItem>
            <SelectItem value="simulation">Simulasi / Tryout</SelectItem>
            <SelectItem value="premium">Premium</SelectItem>
          </SelectContent>
        </Select>

        {hideHeader && (
          <Button
            variant="outline"
            size="sm"
            onClick={fetchItems}
            disabled={loading}
            className="h-9 gap-1.5 rounded-lg text-body-sm shrink-0"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            <span>Perbarui Data</span>
          </Button>
        )}
      </div>

      {/* Quizzes Grid / Table */}
      <AdminTable>
        {loading ? (
          <div className="p-8 text-center text-body-sm text-muted-foreground space-y-3">
            <RefreshCw className="size-6 animate-spin mx-auto text-brand-primary" />
            <p>Memuat data kuis dan evaluasi...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <AdminEmptyState
            icon={HelpCircle}
            title="Tidak ada kuis yang ditemukan"
            description={
              lockedCourse
                ? "Belum ada kuis untuk mata kuliah ini atau kuis tidak cocok dengan filter."
                : "Coba sesuaikan kata kunci pencarian atau filter mata kuliah."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-body-sm">
              <AdminTableHead className="text-body-xs font-semibold text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Nama Kuis / Exam</th>
                  {!lockedCourse && <th className="px-4 py-3">Mata Kuliah</th>}
                  <th className="px-4 py-3">Kategori</th>
                  <th className="px-4 py-3 text-center">Pengerjaan</th>
                  <th className="px-4 py-3 text-center">Rata-rata Nilai</th>
                  <th className="px-4 py-3 text-center">Kelulusan (≥70)</th>
                  <th className="px-4 py-3">Status Insight</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </AdminTableHead>
              <tbody className="divide-y divide-border">
                {filteredItems.map((item) => {
                  const detailHref = `${detailHrefPrefix}/${encodeURIComponent(item.id)}`;
                  return (
                    <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3.5 font-medium text-foreground">
                        <div>
                          <p className="font-semibold line-clamp-1">{item.title}</p>
                          <p className="text-body-xs text-muted-foreground font-mono">ID: {item.id}</p>
                        </div>
                      </td>
                      {!lockedCourse && (
                        <td className="px-4 py-3.5 text-muted-foreground">
                          <Badge variant="outline" className="rounded-md font-normal text-body-xs">
                            {item.courseName}
                          </Badge>
                        </td>
                      )}
                      <td className="px-4 py-3.5">
                        <Badge variant="secondary" className="rounded-md text-body-xs capitalize">
                          {item.category}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5 text-center font-medium tabular-nums">
                        {item.totalAttempts} siswa
                      </td>
                      <td className="px-4 py-3.5 text-center font-semibold tabular-nums">
                        <span className={item.avgScore >= 70 ? "text-status-success" : "text-status-warning"}>
                          {item.avgScore} / 100
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center font-medium tabular-nums">
                        {item.passRate}%
                      </td>
                      <td className="px-4 py-3.5">
                        {item.lastAiInsight ? (
                          <div className="flex items-center gap-1.5 text-status-success text-body-xs font-medium">
                            <CheckCircle2 className="size-4 shrink-0" />
                            <span>
                              Sudah dianalisis (<FormattedDate date={item.lastAiInsight.createdAt} options={{ day: "numeric", month: "short", year: "numeric" }} />)
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-muted-foreground text-body-xs">
                            <HelpCircle className="size-3.5 text-muted-foreground/60 shrink-0" />
                            <span>Belum dianalisis</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <Link href={detailHref}>
                          <Button
                            size="sm"
                            variant={item.lastAiInsight ? "default" : "outline"}
                            className="gap-1.5 rounded-lg text-body-xs"
                          >
                            <span>Lihat Analisis</span>
                            <ArrowRight className="size-3.5" />
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AdminTable>
    </div>
  );
}
