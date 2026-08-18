"use client";

import { useState } from "react";
import { Download, FileArchive, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminSectionTitle } from "@/components/admin/section-title";
import { AdminTable } from "@/components/admin/table";
import { AdminTabs, AdminTabsContent, AdminTabsList, AdminTabsTrigger } from "@/components/admin/tabs";
import { AuthoringJobBuilder } from "@/components/admin/authoring-job-builder";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AuthoringCourseOption } from "@/lib/authoring/catalog";

type ExportRow = {
  id: string;
  packId: string;
  action: string;
  correlationId: string | null;
  createdAt: string;
  artifactChecksum: string | null;
  courseId: string | null;
  retentionUntil: string | null;
  byteLength: number | null;
};

export function AuthoringContextPanel({ initialExports, courses }: { initialExports: ExportRow[]; courses: AuthoringCourseOption[] }) {
  const [courseId, setCourseId] = useState("");
  const [exports, setExports] = useState(initialExports);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [latestDownloadHref, setLatestDownloadHref] = useState<string | null>(null);

  async function refresh() {
    const response = await fetch("/api/admin/authoring-context", { cache: "no-store" });
    if (!response.ok) throw new Error("AUTHORING_CONTEXT_LIST_FAILED");
    const payload = (await response.json()) as { exports: ExportRow[] };
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
      if (!response.ok) throw new Error(payload.error || "AUTHORING_CONTEXT_EXPORT_FAILED");
      setMessage(`Pack ${payload.result?.packId ?? ""} tersimpan dengan checksum artifact ${payload.result?.artifactChecksum ?? ""}.`);
      await refresh();
      setLatestDownloadHref(payload.result?.downloadHref ?? null);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "AUTHORING_CONTEXT_EXPORT_FAILED");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative overflow-hidden space-y-8">
      <AdminPageHeader
        icon={ShieldCheck}
        title="Authoring eksternal"
        description="Siapkan pekerjaan dari Source Pack, lalu lanjutkan produk dari Ideas yang sudah terbit. Semua pilihan memakai nama yang mudah dikenali."
      />

      <AdminTabs defaultValue="prepare">
        <AdminTabsList>
          <AdminTabsTrigger value="prepare"><FileArchive className="size-4" />Siapkan pekerjaan</AdminTabsTrigger>
          <AdminTabsTrigger value="continue"><ShieldCheck className="size-4" />Lanjutkan setelah Idea</AdminTabsTrigger>
        </AdminTabsList>

        <AdminTabsContent value="prepare">
          <AuthoringJobBuilder courses={courses} />
        </AdminTabsContent>

        <AdminTabsContent value="continue" className="space-y-8">
          <section className="space-y-4">
            <AdminSectionTitle
              as="h2"
              icon={ShieldCheck}
              title="Buat Authoring Context Pack"
            />
            <div className="space-y-2 rounded-xl border border-border bg-card p-4 shadow-sm">
              <Label htmlFor="context-course">Mata kuliah</Label>
              <Select value={courseId} onValueChange={setCourseId}>
                <SelectTrigger id="context-course"><SelectValue placeholder="Pilih mata kuliah" /></SelectTrigger>
                <SelectContent>
                  {courses.map((course) => <SelectItem key={course.id} value={course.id}>{course.code} ; {course.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button type="button" disabled={!courseId || loading} isLoading={loading} onClick={() => void exportPack()}>
              <Download className="size-4" />
              Buat dan simpan Context Pack
            </Button>
            {message && <p className="text-body-sm text-status-success">{message}</p>}
            {latestDownloadHref && (
              <Button asChild size="sm" variant="outline">
                <a href={latestDownloadHref}><Download className="size-4" />Unduh pack baru</a>
              </Button>
            )}
            {error && <p className="text-body-sm text-status-error">{error}</p>}
          </section>

          <section className="space-y-3">
            <AdminSectionTitle as="h2" border title="Riwayat Context Pack" right={<span className="text-body-xs text-muted-foreground">{exports.length} pack</span>} />
            <AdminTable className="divide-y divide-border">
              {exports.length === 0 && <p className="px-4 py-6 text-body-sm text-muted-foreground">Belum ada pack.</p>}
              {exports.map((item) => {
                const course = courses.find((candidate) => candidate.id === item.courseId);
                return (
                  <div key={item.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <p className="text-body-sm font-semibold text-foreground">{item.packId}</p>
                      <p className="break-all font-mono text-body-xs text-muted-foreground">{item.artifactChecksum ?? "checksum tidak tersedia"}</p>
                      <p className="text-body-xs text-muted-foreground">{course ? `${course.code} ; ${course.title}` : "Mata kuliah tidak tersedia"} ; berlaku sampai {item.retentionUntil ?? "tidak diketahui"}</p>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <a href={`/api/admin/authoring-context/${encodeURIComponent(item.packId)}`}><Download className="size-4" />Unduh</a>
                    </Button>
                  </div>
                );
              })}
            </AdminTable>
          </section>
        </AdminTabsContent>
      </AdminTabs>
    </div>
  );
}
