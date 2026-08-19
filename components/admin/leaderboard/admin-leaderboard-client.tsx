"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import {
  Trophy,
  RefreshCw,
  Eye,
  SlidersHorizontal,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FormattedDate } from "@/components/ui/formatted-date";
import { SearchBar } from "@/components/ui/search-bar";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { AdminTable, AdminTableHead } from "@/components/admin/table";
import { CourseCombobox, type CourseOption } from "@/components/admin/course-combobox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface StudentAttemptItem {
  id: string;
  title: string;
  category: string;
  courseId: string;
  courseTitle: string;
  score: number;
  durationSeconds: number;
  submittedAt: string | null;
}

interface RankedStudent {
  rank: number;
  studentId: string;
  studentName: string;
  studentEmail: string;
  studentImage: string | null;
  attemptCount: number;
  avgScore: number;
  bestScore: number;
  totalScore: number;
  avgDuration: number;
  lastAttemptAt: string | null;
  courseNames: string[];
  attempts: StudentAttemptItem[];
}

interface LeaderboardSummary {
  totalStudents: number;
  totalAttempts: number;
  avgOverallScore: number;
  highestScore: number;
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "0s";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "SZ";
}

export function AdminLeaderboardClient() {
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [students, setStudents] = useState<RankedStudent[]>([]);
  const [summary, setSummary] = useState<LeaderboardSummary>({
    totalStudents: 0,
    totalAttempts: 0,
    avgOverallScore: 0,
    highestScore: 0,
  });
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedCourse, setSelectedCourse] = useState("all");
  const [selectedType, setSelectedType] = useState("all");
  const [search, setSearch] = useState("");

  // Modal detail
  const [detailStudent, setDetailStudent] = useState<RankedStudent | null>(null);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedCourse && selectedCourse !== "all") {
        params.set("courseId", selectedCourse);
      }
      if (selectedType && selectedType !== "all") {
        params.set("type", selectedType);
      }
      if (search.trim()) {
        params.set("search", search.trim());
      }

      const res = await fetch(`/api/admin/leaderboard?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setCourses(data.courses || []);
        setStudents(data.students || []);
        setSummary(
          data.summary || {
            totalStudents: 0,
            totalAttempts: 0,
            avgOverallScore: 0,
            highestScore: 0,
          }
        );
      }
    } catch (err) {
      console.error("Gagal memuat papan peringkat:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedCourse, selectedType, search]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  const hasActiveFilters =
    selectedCourse !== "all" || selectedType !== "all" || search.trim() !== "";

  const resetFilters = () => {
    setSelectedCourse("all");
    setSelectedType("all");
    setSearch("");
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        icon={Trophy}
        title="Papan Peringkat"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={fetchLeaderboard}
            disabled={loading}
            className="gap-2 rounded-lg"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            <span>Perbarui Data</span>
          </Button>
        }
      />

      {/* Minimal KPI Stats Bar */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-lg border border-border bg-card/60 px-3.5 py-2 text-body-xs shadow-2xs">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Siswa Dinilai:</span>
          <span className="font-bold tabular-nums text-foreground">
            {summary.totalStudents}
          </span>
        </div>
        <span className="text-border hidden sm:inline">•</span>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Total Pengerjaan:</span>
          <span className="font-bold tabular-nums text-foreground">
            {summary.totalAttempts}
          </span>
        </div>
        <span className="text-border hidden sm:inline">•</span>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Rata-rata Nilai:</span>
          <span className="font-bold tabular-nums text-brand-primary">
            {summary.avgOverallScore}%
          </span>
        </div>
        <span className="text-border hidden sm:inline">•</span>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Skor Tertinggi:</span>
          <span className="font-bold tabular-nums text-status-success">
            {summary.highestScore}
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <SearchBar
          size="sm"
          placeholder="Cari nama atau email siswa..."
          value={search}
          onSearch={setSearch}
          onClear={() => setSearch("")}
          containerClassName="flex-1 min-w-0"
        />

        <div className="flex items-center gap-2 shrink-0">
          <CourseCombobox
            courses={courses}
            value={selectedCourse}
            onValueChange={setSelectedCourse}
            allLabel="Semua Mata Kuliah"
          />

          <Select value={selectedType} onValueChange={setSelectedType}>
            <SelectTrigger className="w-[140px] sm:w-[160px] h-9 text-body-xs rounded-lg shrink-0">
              <SelectValue placeholder="Tipe Asesmen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Tipe</SelectItem>
              <SelectItem value="quiz">Kuis</SelectItem>
              <SelectItem value="simulation">Simulasi / Tryout</SelectItem>
            </SelectContent>
          </Select>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              title="Reset filter"
              className="h-9 px-2.5 text-body-xs text-muted-foreground hover:text-foreground rounded-lg"
            >
              <X className="size-3.5 mr-1" />
              <span>Reset</span>
            </Button>
          )}
        </div>
      </div>

      {/* Leaderboard Table */}
      <AdminTable>
        {loading ? (
          <div className="p-12 text-center text-body-sm text-muted-foreground space-y-3">
            <RefreshCw className="size-6 animate-spin mx-auto text-brand-primary" />
            <p>Memuat data papan peringkat...</p>
          </div>
        ) : students.length === 0 ? (
          <AdminEmptyState
            icon={SlidersHorizontal}
            title="Tidak ada data peringkat"
            description="Belum ada pengerjaan kuis yang cocok dengan filter atau kata kunci saat ini."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-body-sm">
              <AdminTableHead className="text-body-xs font-semibold text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 w-16 text-center">#</th>
                  <th className="px-4 py-3">Siswa</th>
                  <th className="px-4 py-3">Mata Kuliah</th>
                  <th className="px-4 py-3 text-center">Pengerjaan</th>
                  <th className="px-4 py-3 text-center">Rata-rata Nilai</th>
                  <th className="px-4 py-3 text-center">Skor Terbaik</th>
                  <th className="px-4 py-3 text-center">Rata-rata Durasi</th>
                  <th className="px-4 py-3">Terakhir Mengerjakan</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </AdminTableHead>
              <tbody className="divide-y divide-border">
                {students.map((student) => {
                  const isTop1 = student.rank === 1;
                  const isTop2 = student.rank === 2;
                  const isTop3 = student.rank === 3;

                  return (
                    <tr
                      key={student.studentId}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      {/* Rank Column */}
                      <td className="px-4 py-3.5 text-center">
                        <span
                          className={cn(
                            "inline-flex size-7 items-center justify-center rounded-lg text-body-xs font-bold tabular-nums",
                            isTop1 &&
                              "bg-brand-secondary/20 text-brand-secondary border border-brand-secondary/40",
                            isTop2 &&
                              "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700",
                            isTop3 &&
                              "bg-amber-800/15 text-amber-800 dark:text-amber-400 border border-amber-800/30",
                            !isTop1 &&
                              !isTop2 &&
                              !isTop3 &&
                              "text-muted-foreground bg-muted/60"
                          )}
                        >
                          {student.rank}
                        </span>
                      </td>

                      {/* Student Info */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          {student.studentImage ? (
                            <Image
                              src={student.studentImage}
                              alt={student.studentName}
                              width={32}
                              height={32}
                              unoptimized
                              className="size-8 rounded-full object-cover border border-border shrink-0"
                            />
                          ) : (
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary font-bold text-body-xs border border-brand-primary/20">
                              {getInitials(student.studentName)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground truncate">
                              {student.studentName}
                            </p>
                            <p className="text-body-xs text-muted-foreground truncate">
                              {student.studentEmail}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Courses */}
                      <td className="px-4 py-3.5">
                        {student.courseNames.length === 1 ? (
                          <Badge
                            variant="outline"
                            className="rounded-md font-normal text-body-xs truncate max-w-[180px]"
                          >
                            {student.courseNames[0]}
                          </Badge>
                        ) : student.courseNames.length > 1 ? (
                          <Badge
                            variant="secondary"
                            className="rounded-md font-normal text-body-xs"
                            title={student.courseNames.join(", ")}
                          >
                            {student.courseNames.length} mata kuliah
                          </Badge>
                        ) : (
                          <span className="text-body-xs text-muted-foreground">-</span>
                        )}
                      </td>

                      {/* Total Attempts */}
                      <td className="px-4 py-3.5 text-center tabular-nums font-medium">
                        {student.attemptCount} kuis
                      </td>

                      {/* Average Score */}
                      <td className="px-4 py-3.5 text-center tabular-nums font-semibold">
                        <span
                          className={
                            student.avgScore >= 70
                              ? "text-status-success"
                              : "text-status-warning"
                          }
                        >
                          {student.avgScore}%
                        </span>
                      </td>

                      {/* Best Score */}
                      <td className="px-4 py-3.5 text-center tabular-nums text-foreground font-medium">
                        {student.bestScore}
                      </td>

                      {/* Average Duration */}
                      <td className="px-4 py-3.5 text-center tabular-nums text-muted-foreground text-body-xs">
                        {formatDuration(student.avgDuration)}
                      </td>

                      {/* Last Attempt */}
                      <td className="px-4 py-3.5 text-muted-foreground text-body-xs whitespace-nowrap">
                        {student.lastAttemptAt ? (
                          <FormattedDate
                            date={student.lastAttemptAt}
                            options={{
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            }}
                          />
                        ) : (
                          "-"
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDetailStudent(student)}
                          className="h-8 gap-1.5 px-2 text-body-xs text-brand-primary hover:text-brand-primary rounded-lg"
                        >
                          <Eye className="size-3.5" />
                          <span>Detail</span>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AdminTable>

      {/* Student Attempt History Dialog */}
      {detailStudent && (
        <Dialog
          open={Boolean(detailStudent)}
          onOpenChange={(open) => {
            if (!open) setDetailStudent(null);
          }}
        >
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Riwayat Pengerjaan: {detailStudent.studentName}</DialogTitle>
              <DialogDescription>
                {detailStudent.studentEmail} • {detailStudent.attemptCount} pengerjaan selesai
                • Rata-rata skor {detailStudent.avgScore}%
              </DialogDescription>
            </DialogHeader>

            <div className="overflow-x-auto rounded-lg border border-border mt-2">
              <table className="w-full text-left text-body-sm">
                <thead className="bg-muted/50 border-b border-border text-body-xs font-semibold text-muted-foreground">
                  <tr>
                    <th className="px-3.5 py-2.5">Judul Kuis</th>
                    <th className="px-3.5 py-2.5">Mata Kuliah</th>
                    <th className="px-3.5 py-2.5">Kategori</th>
                    <th className="px-3.5 py-2.5 text-center">Nilai</th>
                    <th className="px-3.5 py-2.5 text-center">Durasi</th>
                    <th className="px-3.5 py-2.5">Waktu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {detailStudent.attempts.map((att) => (
                    <tr key={att.id} className="hover:bg-muted/20">
                      <td className="px-3.5 py-2.5 font-medium text-foreground">
                        {att.title}
                      </td>
                      <td className="px-3.5 py-2.5 text-muted-foreground text-body-xs">
                        {att.courseTitle}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <Badge variant="secondary" className="rounded-md text-body-xs capitalize">
                          {att.category === "simulation" ? "Simulasi" : att.category}
                        </Badge>
                      </td>
                      <td className="px-3.5 py-2.5 text-center font-semibold tabular-nums">
                        <span
                          className={
                            att.score >= 70
                              ? "text-status-success"
                              : "text-status-warning"
                          }
                        >
                          {att.score}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 text-center tabular-nums text-muted-foreground text-body-xs">
                        {formatDuration(att.durationSeconds)}
                      </td>
                      <td className="px-3.5 py-2.5 text-muted-foreground text-body-xs whitespace-nowrap">
                        {att.submittedAt ? (
                          <FormattedDate
                            date={att.submittedAt}
                            options={{
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            }}
                          />
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
