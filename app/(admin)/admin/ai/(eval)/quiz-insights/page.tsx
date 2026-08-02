"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  BarChart3,
  Sparkles,
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

interface QuizInsightOverviewItem {
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

export default function AdminQuizInsightsOverviewPage() {
  const [items, setItems] = useState<QuizInsightOverviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCourse, setSelectedCourse] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/quiz-insights");
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch (err) {
      console.error("Gagal mengambil data ringkasan kuis:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  // Filter items locally
  const filteredItems = items.filter((item) => {
    const matchSearch =
      !search ||
      item.title.toLowerCase().includes(search.toLowerCase()) ||
      item.courseName.toLowerCase().includes(search.toLowerCase());
    const matchCourse = selectedCourse === "all" || item.courseId === selectedCourse;
    const matchCategory = selectedCategory === "all" || item.category === selectedCategory;
    return matchSearch && matchCourse && matchCategory;
  });

  // Extract unique courses for filter
  const uniqueCourses = Array.from(
    new Map(items.map((i) => [i.courseId, i.courseName || i.courseId])).entries()
  );

  // High-level KPI metrics
  const totalQuizzes = items.length;
  const totalAttemptsSum = items.reduce((acc, curr) => acc + curr.totalAttempts, 0);
  const avgOverallScore =
    items.length > 0
      ? Math.round(items.reduce((acc, curr) => acc + curr.avgScore, 0) / items.length)
      : 0;
  const analyzedWithAiCount = items.filter((i) => i.lastAiInsight !== null).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between border-b border-border pb-5">
        <div>
          <h1 className="font-heading text-h3 text-foreground font-bold flex items-center gap-2.5">
            <BarChart3 className="size-7 text-brand-primary" />
            Analisis & Insight Kuis / Exam
          </h1>
          <p className="text-body-base text-muted-foreground mt-1">
            Halaman khusus evaluasi performa kuis, simulasi, dan asesmen. Temukan konsep yang menyulitkan, distraktor jebakan, serta rekomendasi pengajaran AI Gemini untuk tutor.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchItems}
          disabled={loading}
          className="self-start md:self-auto gap-2 rounded-lg"
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          Perbarui Data
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-body-sm font-medium">Total Kuis & Simulasi</span>
            <BookOpen className="size-4 text-brand-primary" />
          </div>
          <p className="text-h4 font-heading font-bold text-foreground">{totalQuizzes}</p>
          <p className="text-body-xs text-muted-foreground">Terdaftar di sistem Zyx</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-body-sm font-medium font-sans">Total Pengerjaan</span>
            <TrendingUp className="size-4 text-status-info" />
          </div>
          <p className="text-h4 font-heading font-bold text-foreground">{totalAttemptsSum}</p>
          <p className="text-body-xs text-muted-foreground">Pengerjaan selesai oleh siswa</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-body-sm font-medium">Rata-rata Nilai</span>
            <Award className="size-4 text-brand-secondary" />
          </div>
          <p className="text-h4 font-heading font-bold text-foreground">{avgOverallScore} / 100</p>
          <p className="text-body-xs text-muted-foreground">Rata-rata dari seluruh kuis</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-body-sm font-medium">Dianalisis AI</span>
            <Sparkles className="size-4 text-brand-primary" />
          </div>
          <p className="text-h4 font-heading font-bold text-foreground">
            {analyzedWithAiCount} <span className="text-body-sm text-muted-foreground font-normal">/ {totalQuizzes}</span>
          </p>
          <p className="text-body-xs text-muted-foreground">Kuis memiliki insight Gemini</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          <SearchBar
            placeholder="Cari berdasarkan judul kuis atau mata kuliah..."
            value={search}
            onSearch={setSearch}
            onClear={() => setSearch("")}
            containerClassName="flex-1"
          />

          <div className="flex flex-wrap sm:flex-nowrap gap-3">
            <Select value={selectedCourse} onValueChange={setSelectedCourse}>
              <SelectTrigger className="w-[200px] rounded-lg">
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

            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-[180px] rounded-lg">
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
          </div>
        </div>
      </div>

      {/* Quizzes Grid / Table */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-body-sm text-muted-foreground space-y-3">
            <RefreshCw className="size-6 animate-spin mx-auto text-brand-primary" />
            <p>Memuat data kuis dan evaluasi...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center text-body-sm text-muted-foreground space-y-2">
            <HelpCircle className="size-8 mx-auto text-muted-foreground/60" />
            <p className="font-semibold text-foreground">Tidak ada kuis yang ditemukan</p>
            <p className="text-body-xs">Coba sesuaikan kata kunci pencarian atau filter mata kuliah.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-body-sm">
              <thead className="bg-muted/50 border-b border-border text-muted-foreground font-medium text-body-xs">
                <tr>
                  <th className="px-4 py-3">Nama Kuis / Exam</th>
                  <th className="px-4 py-3">Mata Kuliah</th>
                  <th className="px-4 py-3">Kategori</th>
                  <th className="px-4 py-3 text-center">Pengerjaan</th>
                  <th className="px-4 py-3 text-center">Rata-rata Nilai</th>
                  <th className="px-4 py-3 text-center">Kelulusan (≥70)</th>
                  <th className="px-4 py-3">Status Insight AI</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3.5 font-medium text-foreground">
                      <div>
                        <p className="font-semibold line-clamp-1">{item.title}</p>
                        <p className="text-body-xs text-muted-foreground">ID: {item.id}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-muted-foreground">
                      <Badge variant="outline" className="rounded-md font-normal text-body-xs">
                        {item.courseName}
                      </Badge>
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge variant="secondary" className="rounded-md text-body-xs capitalize">
                        {item.category}
                      </Badge>
                    </td>
                    <td className="px-4 py-3.5 text-center font-medium">
                      {item.totalAttempts} siswa
                    </td>
                    <td className="px-4 py-3.5 text-center font-semibold">
                      <span className={item.avgScore >= 70 ? "text-status-success" : "text-status-warning"}>
                        {item.avgScore} / 100
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center font-medium">
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
                          <Sparkles className="size-3.5 text-muted-foreground/60 shrink-0" />
                          <span>Belum dianalisis AI</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <Link href={`/admin/ai/quiz-insights/${item.id}`}>
                        <Button size="sm" variant={item.lastAiInsight ? "default" : "outline"} className="gap-1.5 rounded-lg text-body-xs">
                          <span>Lihat Analisis</span>
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
