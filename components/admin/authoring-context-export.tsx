"use client";

import { useState } from "react";
import { Download, ShieldCheck } from "lucide-react";
import { AdminSectionTitle } from "@/components/admin/section-title";
import { AdminTable } from "@/components/admin/table";
import { FormattedDate } from "@/components/ui/formatted-date";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AuthoringCourseOption } from "@/lib/authoring/catalog";

export type AuthoringContextExportRow = {
  id: string;
  packId: string;
  createdAt: string;
  artifactChecksum: string | null;
  courseId: string | null;
  retentionUntil: string | null;
  byteLength: number | null;
};

const dateOptions: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
};

const errorMessages: Record<string, string> = {
  AUTHORING_CONTEXT_INPUT_REQUIRED: "Pilih mata kuliah terlebih dahulu.",
  AUTHORING_CONTEXT_EXPIRED: "Context Pack sudah melewati masa unduh.",
  AUTHORING_CONTEXT_NOT_FOUND: "Context Pack tidak ditemukan.",
};

function explainError(value: string) {
  return errorMessages[value.split(":", 1)[0]] ?? value;
}

export function AuthoringContextExport({
  initialExports,
  courses,
}: {
  initialExports: AuthoringContextExportRow[];
  courses: AuthoringCourseOption[];
}) {
  const [courseId, setCourseId] = useState("");
  const [exports, setExports] = useState(initialExports);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [latestDownloadHref, setLatestDownloadHref] = useState<string | null>(null);

  async function refresh() {
    const response = await fetch("/api/admin/authoring-context", { cache: "no-store" });
    if (!response.ok) throw new Error("AUTHORING_CONTEXT_LIST_FAILED");
    const payload = (await response.json()) as { exports: AuthoringContextExportRow[] };
    setExports(payload.exports);
  }

  async function exportPack() {
    setLoading(true);
    setError(null);
    setMessage(null);
    setLatestDownloadHref(null);
    try {
      const response = await fetch("/api/admin/authoring-context", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ courseId }),
      });
      const payload = (await response.json()) as { result?: { packId: string; artifactChecksum: string; downloadHref: string }; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "AUTHORING_CONTEXT_EXPORT_FAILED");
      setMessage(`Context Pack ${payload.result?.packId ?? ""} siap diunduh.`);
      await refresh();
      setLatestDownloadHref(payload.result?.downloadHref ?? null);
    } catch (exportError) {
      setError(explainError(exportError instanceof Error ? exportError.message : "AUTHORING_CONTEXT_EXPORT_FAILED"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <AdminSectionTitle
        as="h2"
        icon={ShieldCheck}
        title="Lanjutkan dari Idea terbit"
      />

      <div className="grid gap-4 rounded-xl border border-border bg-card p-4 shadow-sm lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="space-y-2">
          <Label htmlFor="context-course">Mata kuliah</Label>
          <Select value={courseId} onValueChange={setCourseId}>
            <SelectTrigger id="context-course"><SelectValue placeholder="Pilih mata kuliah" /></SelectTrigger>
            <SelectContent>
              {courses.map((course) => <SelectItem key={course.id} value={course.id}>{course.code} · {course.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" disabled={!courseId || loading} isLoading={loading} onClick={() => void exportPack()}>
          <ShieldCheck className="size-4" />
          Buat Context Pack
        </Button>
      </div>

      {message && <p className="text-body-sm text-status-success">{message}</p>}
      {latestDownloadHref && <Button asChild size="sm" variant="outline"><a href={latestDownloadHref}><Download className="size-4" />Unduh pack baru</a></Button>}
      {error && <p className="text-body-sm text-status-error">{error}</p>}

      <section className="space-y-3">
        <AdminSectionTitle as="h3" border title="Riwayat Context Pack" right={<span className="text-body-xs text-muted-foreground">{exports.length} pack</span>} />
        <AdminTable className="divide-y divide-border">
          {exports.length === 0 && <p className="px-4 py-6 text-body-sm text-muted-foreground">Belum ada Context Pack.</p>}
          {exports.map((item) => {
            const course = courses.find((candidate) => candidate.id === item.courseId);
            return (
              <div key={item.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="text-body-sm font-semibold text-foreground">{course ? `${course.code} · ${course.title}` : "Mata kuliah tidak tersedia"}</p>
                  <p className="text-body-xs text-muted-foreground">Dibuat <FormattedDate date={item.createdAt} options={dateOptions} /> · berlaku sampai {item.retentionUntil ? <FormattedDate date={item.retentionUntil} options={dateOptions} /> : "tidak diketahui"}</p>
                  <p className="break-all font-mono text-body-xs text-muted-foreground">Checksum: {item.artifactChecksum ?? "tidak tersedia"}</p>
                </div>
                <Button asChild size="sm" variant="outline"><a href={`/api/admin/authoring-context/${encodeURIComponent(item.packId)}`}><Download className="size-4" />Unduh</a></Button>
              </div>
            );
          })}
        </AdminTable>
      </section>
    </div>
  );
}
