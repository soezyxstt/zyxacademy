"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Video,
  PlusCircle,
  Copy,
  ExternalLink,
  Square,
  RefreshCw,
  Clock,
  Users,
  ChevronRight,
  Shield,
  Check,
  AlertCircle,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import { formatIsoDate } from "@/lib/date-utils";

interface MeetSpaceInfo {
  name: string;
  meetingUri: string;
  meetingCode: string;
  title?: string;
}

interface ConferenceRecordItem {
  name: string;
  startTime: string;
  endTime?: string;
  space: string;
  title?: string;
  participantCount?: number;
  peakConcurrentParticipants?: number;
}

export default function AdminMeetPage() {
  const [creating, setCreating] = useState(false);
  const [ending, setEnding] = useState(false);
  const [title, setTitle] = useState("");
  const [accessType, setAccessType] = useState<"OPEN" | "TRUSTED" | "RESTRICTED">("OPEN");
  const [activeSpace, setActiveSpace] = useState<MeetSpaceInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Conference Records
  const [records, setRecords] = useState<ConferenceRecordItem[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchRecords = useCallback(async () => {
    setLoadingRecords(true);
    try {
      const res = await fetch("/api/admin/meet/records");
      const data = await res.json();
      if (data.success && Array.isArray(data.conferenceRecords)) {
        setRecords(data.conferenceRecords);
      } else {
        setRecords([]);
      }
    } catch {
      setRecords([]);
    } finally {
      setLoadingRecords(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const handleCreateSpace = async () => {
    setCreating(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/meet/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || undefined,
          accessType,
        }),
      });
      const data = await res.json();
      if (data.success && data.space) {
        setActiveSpace({ ...data.space, title: title.trim() || "Sesi Meeting Baru" });
        setTitle("");
      } else {
        setErrorMsg(data.error || "Gagal membuat Google Meet space.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Terjadi kesalahan jaringan.");
    } finally {
      setCreating(false);
    }
  };

  const handleEndConference = async () => {
    if (!activeSpace) return;
    setEnding(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/meet/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceName: activeSpace.name }),
      });
      const data = await res.json();
      if (data.success) {
        setActiveSpace(null);
        fetchRecords();
      } else {
        setErrorMsg(data.error || "Gagal mengakhiri meeting.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Terjadi kesalahan jaringan.");
    } finally {
      setEnding(false);
    }
  };

  const handleDeleteRecord = async (recordName: string) => {
    const recordId = recordName.replace(/^conferenceRecords\//, "");
    if (!confirm("Apakah Anda yakin ingin menghapus log meeting ini dari daftar?")) return;

    setDeletingId(recordId);
    try {
      const res = await fetch(`/api/admin/meet/records/${recordId}/delete`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setRecords((prev) => prev.filter((r) => r.name !== recordName));
      } else {
        alert(data.error || "Gagal menghapus log meeting.");
      }
    } catch (err: any) {
      alert(err.message || "Terjadi kesalahan jaringan.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleCopyLink = () => {
    if (!activeSpace?.meetingUri) return;
    navigator.clipboard.writeText(activeSpace.meetingUri);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTimeOnly = (isoStr?: string) => {
    if (!isoStr) return "-";
    return new Date(isoStr).toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const calculateDuration = (startStr: string, endStr?: string) => {
    if (!endStr) return "Sedang Berlangsung";
    const start = new Date(startStr).getTime();
    const end = new Date(endStr).getTime();
    const diffSec = Math.round((end - start) / 1000);
    if (diffSec < 60) return `${diffSec} s`;
    const mins = Math.floor(diffSec / 60);
    const secs = diffSec % 60;
    return `${mins} m ${secs} s`;
  };

  return (
    <Reveal className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
              <Video className="size-5" />
            </span>
            <h1 className="font-heading text-h4 font-bold text-foreground">
              Studio Sesi & Temu (Meet)
            </h1>
          </div>
          <p className="mt-2 text-body-md text-muted-foreground">
            Kelola sesi ruang temu, jalankan meeting langsung di bawah akun Pro, dan pantau log serta metrik kehadiran peserta.
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="mt-6 flex items-center gap-3 rounded-xl border border-status-error/30 bg-status-error/10 p-4 text-body-sm text-status-error">
          <AlertCircle className="size-5 shrink-0" />
          <p>{errorMsg}</p>
        </div>
      )}

      {/* Top Action Section: Create & Manage Active Meeting */}
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        {/* Card 1: Start Meeting Controls */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <PlusCircle className="size-5 text-brand-primary" />
            <h2 className="font-heading text-h5 font-semibold text-foreground">
              Buat Meeting Baru
            </h2>
          </div>
          <p className="mt-2 text-body-sm text-muted-foreground">
            Inisiasi ruang Google Meet baru dengan Master Host Pro. Beri nama meeting agar mudah diidentifikasi.
          </p>

          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-body-xs font-semibold text-foreground mb-1">
                Nama / Judul Meeting (Opsional)
              </label>
              <input
                type="text"
                placeholder="Contoh: Tutorial Fisika Kinematika Bab 2"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-body-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <div>
              <label className="block text-body-xs font-semibold text-foreground mb-1">
                Aksesibilitas Ruang Meeting
              </label>
              <select
                value={accessType}
                onChange={(e) => setAccessType(e.target.value as any)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-body-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="OPEN">OPEN (Siapa pun dapat langsung masuk)</option>
                <option value="TRUSTED">TRUSTED (Anggota organisasi / diundang)</option>
                <option value="RESTRICTED">RESTRICTED (Memerlukan izin host)</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleCreateSpace}
              disabled={creating}
              className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-body-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {creating ? (
                <>
                  <RefreshCw className="size-4 animate-spin" />
                  Membuat Ruang...
                </>
              ) : (
                <>
                  <Video className="size-4" />
                  Mulai & Inisiasi Meeting
                </>
              )}
            </button>
          </div>
        </div>

        {/* Card 2: Active Meeting Card */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="size-5 text-status-success" />
                <h2 className="font-heading text-h5 font-semibold text-foreground">
                  Status Meeting Aktif
                </h2>
              </div>
              {activeSpace ? (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-status-success/15 px-2.5 py-1 text-body-xs font-semibold text-status-success">
                  <span className="size-2 rounded-full bg-status-success animate-pulse" />
                  Live Aktif
                </span>
              ) : (
                <span className="rounded-md bg-muted px-2.5 py-1 text-body-xs font-medium text-muted-foreground">
                  Tidak Ada Meeting Aktif
                </span>
              )}
            </div>

            {activeSpace ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-border/80 bg-muted/40 p-3">
                  <p className="font-heading text-h6 font-bold text-foreground">
                    {activeSpace.title}
                  </p>
                  <p className="text-body-xs font-mono text-muted-foreground mt-0.5">
                    Kode: {activeSpace.meetingCode}
                  </p>
                  <p className="mt-2 truncate text-body-sm font-medium text-brand-primary">
                    {activeSpace.meetingUri}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-body-xs font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
                  >
                    {copied ? <Check className="size-3.5 text-status-success" /> : <Copy className="size-3.5" />}
                    {copied ? "Tersalin!" : "Salin Link"}
                  </button>

                  <a
                    href={activeSpace.meetingUri}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-body-xs font-semibold text-brand-primary hover:bg-muted transition-colors"
                  >
                    <ExternalLink className="size-3.5" />
                    Buka sebagai Host
                  </a>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-body-sm text-muted-foreground">
                Belum ada sesi meeting yang dibuat dari panel ini. Buat meeting baru menggunakan formulir di sebelah kiri.
              </p>
            )}
          </div>

          {activeSpace && (
            <div className="mt-4 pt-4 border-t border-border">
              <button
                type="button"
                onClick={handleEndConference}
                disabled={ending}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-status-error/10 border border-status-error/30 px-3 py-2 text-body-sm font-semibold text-status-error hover:bg-status-error/20 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {ending ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <Square className="size-4 fill-current" />
                )}
                Akhiri Sesi Meeting Aktif
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Conference Records / Log Section */}
      <section className="mt-10 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h2 className="font-heading text-h5 font-bold text-foreground">
              Daftar Log Meeting (Conference Records)
            </h2>
            <p className="text-body-sm text-muted-foreground">
              Riwayat sesi meeting yang telah selesai beserta metrik peak peserta, rekaman, transkrip, dan analisis kehadiran.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchRecords}
            disabled={loadingRecords}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-body-xs font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`size-3.5 ${loadingRecords ? "animate-spin" : ""}`} />
            Muat Ulang
          </button>
        </div>

        {loadingRecords ? (
          <div className="flex h-40 items-center justify-center rounded-2xl border border-border bg-card">
            <RefreshCw className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-12 text-center">
            <Clock className="size-10 text-muted-foreground/60" />
            <p className="mt-3 font-heading text-h6 font-semibold text-foreground">
              Belum Ada Log Sesi Meeting
            </p>
            <p className="mt-1 text-body-sm text-muted-foreground max-w-md">
              Sesi meeting yang diselesaikan akan muncul di sini secara otomatis beserta metrik dan log partisipannya.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-body-sm">
                <thead className="border-b border-border bg-muted/50 text-body-xs font-semibold text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Nama / Judul Meeting</th>
                    <th className="px-4 py-3">Waktu Mulai & Selesai</th>
                    <th className="px-4 py-3">Durasi</th>
                    <th className="px-4 py-3">Peak & Total Peserta</th>
                    <th className="px-4 py-3 text-right">Aksi & Log</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {records.map((rec) => {
                    const recordId = rec.name.replace(/^conferenceRecords\//, "");
                    const isDeleting = deletingId === recordId;
                    const peak = rec.peakConcurrentParticipants || rec.participantCount || 0;
                    const total = rec.participantCount || 0;

                    return (
                      <tr key={rec.name} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3.5 font-medium text-foreground whitespace-nowrap">
                          <p className="font-bold text-body-sm text-foreground">
                            {rec.title || `Meeting ${recordId.slice(0, 8)}`}
                          </p>
                          <p className="font-mono text-body-xs text-muted-foreground">
                            ID: {recordId.slice(0, 16)}...
                          </p>
                        </td>

                        <td className="px-4 py-3.5 text-foreground whitespace-nowrap">
                          <p className="font-semibold text-body-xs">
                            {formatIsoDate(new Date(rec.startTime))}
                          </p>
                          <p className="text-body-xs text-muted-foreground">
                            {formatTimeOnly(rec.startTime)} - {formatTimeOnly(rec.endTime)}
                          </p>
                        </td>

                        <td className="px-4 py-3.5 text-muted-foreground whitespace-nowrap font-medium">
                          {calculateDuration(rec.startTime, rec.endTime)}
                        </td>

                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-body-xs font-semibold text-foreground">
                            <TrendingUp className="size-3.5 text-brand-primary" />
                            <span>Peak: <strong className="text-brand-primary">{peak}</strong></span>
                            <span className="text-muted-foreground font-normal">(Total: {total})</span>
                          </div>
                        </td>

                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={`/admin/meet/${recordId}`}
                              className="inline-flex items-center gap-1 rounded-lg border border-brand-primary/30 bg-brand-primary/10 px-3 py-1.5 text-body-xs font-semibold text-brand-primary hover:bg-brand-primary/20 transition-colors"
                            >
                              <Users className="size-3.5" />
                              Detail Log Peserta
                              <ChevronRight className="size-3.5" />
                            </Link>

                            <button
                              type="button"
                              onClick={() => handleDeleteRecord(rec.name)}
                              disabled={isDeleting}
                              title="Hapus log meeting"
                              className="inline-flex items-center justify-center rounded-lg border border-status-error/30 bg-status-error/10 p-1.5 text-status-error hover:bg-status-error/20 transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              {isDeleting ? (
                                <RefreshCw className="size-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="size-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </Reveal>
  );
}
