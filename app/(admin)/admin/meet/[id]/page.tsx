"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Clock,
  Users,
  Video,
  ExternalLink,
  LogIn,
  LogOut,
  RefreshCw,
  AlertCircle,
  PlayCircle,
  MessageSquare,
} from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import { formatIsoDate } from "@/lib/date-utils";
import type { ComprehensiveMeetingAnalytics } from "@/lib/google-meet";

export default function DetailedMeetingLogPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const conferenceRecordId = resolvedParams.id;

  const [analytics, setAnalytics] = useState<ComprehensiveMeetingAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/meet/records/${conferenceRecordId}`);
      const data = await res.json();
      if (data.success && data.analytics) {
        setAnalytics(data.analytics);
      } else {
        setError(data.error || "Gagal memuat data log meeting.");
      }
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan jaringan.");
    } finally {
      setLoading(false);
    }
  }, [conferenceRecordId]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const formatTimeOnly = (isoStr: string) => {
    if (!isoStr) return "-";
    return new Date(isoStr).toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const formatDurationSec = (seconds?: number) => {
    if (!seconds && seconds !== 0) return "-";
    if (seconds < 60) return `${seconds} detik`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins} m ${secs} s`;
  };

  return (
    <Reveal className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      {/* Back Button */}
      <Link
        href="/admin/meet"
        className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="size-4" />
        Kembali ke Operational Meet
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="font-heading text-h4 font-bold text-foreground flex items-center gap-2">
            <Video className="size-6 text-brand-primary" />
            Detail Log & Analytics Meeting
          </h1>
          <p className="mt-1 font-mono text-body-sm text-muted-foreground">
            ID Record: conferenceRecords/{conferenceRecordId}
          </p>
        </div>
        <button
          type="button"
          onClick={fetchAnalytics}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-body-xs font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          Muat Ulang
        </button>
      </div>

      {error && (
        <div className="mt-6 flex items-center gap-3 rounded-xl border border-status-error/30 bg-status-error/10 p-4 text-body-sm text-status-error">
          <AlertCircle className="size-5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {loading ? (
        <div className="mt-10 flex h-60 items-center justify-center rounded-2xl border border-border bg-card">
          <RefreshCw className="size-8 animate-spin text-brand-primary" />
        </div>
      ) : !analytics ? (
        <div className="mt-10 flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-12 text-center">
          <AlertCircle className="size-10 text-muted-foreground" />
          <p className="mt-3 font-heading text-h6 font-semibold text-foreground">
            Log Meeting Tidak Ditemukan
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {/* Overview Metric Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="size-4" />
                <span className="text-body-xs font-semibold uppercase tracking-wider">
                  Waktu & Durasi
                </span>
              </div>
              <p className="mt-2 font-heading text-h5 font-bold text-foreground">
                {formatDurationSec(analytics.totalDurationSeconds)}
              </p>
              <p className="mt-1 text-body-xs text-muted-foreground">
                {formatIsoDate(new Date(analytics.startTime))} ({formatTimeOnly(analytics.startTime)} - {formatTimeOnly(analytics.endTime || "")})
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="size-4" />
                <span className="text-body-xs font-semibold uppercase tracking-wider">
                  Total Peserta
                </span>
              </div>
              <p className="mt-2 font-heading text-h5 font-bold text-foreground">
                {analytics.participantCount} Orang
              </p>
              <p className="mt-1 text-body-xs text-muted-foreground">
                Tercatat hadir dalam sesi
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <PlayCircle className="size-4" />
                <span className="text-body-xs font-semibold uppercase tracking-wider">
                  Rekaman Video
                </span>
              </div>
              <p className="mt-2 font-heading text-h5 font-bold text-foreground">
                {analytics.recordings.length} File
              </p>
              <p className="mt-1 text-body-xs text-muted-foreground">
                Google Drive Cloud Recording
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <MessageSquare className="size-4" />
                <span className="text-body-xs font-semibold uppercase tracking-wider">
                  Transkrip Bicara
                </span>
              </div>
              <p className="mt-2 font-heading text-h5 font-bold text-foreground">
                {analytics.transcripts.reduce((acc, t) => acc + t.entries.length, 0)} Baris
              </p>
              <p className="mt-1 text-body-xs text-muted-foreground">
                Tersedia dialog teks otomatis
              </p>
            </div>
          </div>

          {/* Participant Log & Session Timeline Section */}
          <section className="space-y-4">
            <div className="border-b border-border pb-3">
              <h2 className="font-heading text-h5 font-bold text-foreground flex items-center gap-2">
                <Users className="size-5 text-brand-primary" />
                Daftar & Timeline Kehadiran Peserta (Session Logs)
              </h2>
              <p className="text-body-sm text-muted-foreground">
                Rincian timestamp menit masuk (hijau) dan menit keluar (merah) untuk setiap peserta.
              </p>
            </div>

            {analytics.participants.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">
                Tidak ada data peserta tercatat untuk sesi meeting ini.
              </div>
            ) : (
              <div className="space-y-4">
                {analytics.participants.map((p, idx) => (
                  <div
                    key={p.participantId || idx}
                    className="rounded-2xl border border-border bg-card p-5 shadow-sm hover:border-border/80 transition-colors"
                  >
                    {/* Participant Header Info */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/60 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary font-bold text-body-md">
                          {p.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-heading text-h6 font-semibold text-foreground">
                              {p.displayName}
                            </h3>
                            <span className="rounded-md bg-muted px-2 py-0.5 text-body-xs font-semibold text-muted-foreground">
                              {p.userType}
                            </span>
                          </div>
                          {p.userResourceNameOrEmail && (
                            <p className="text-body-xs font-mono text-muted-foreground">
                              {p.userResourceNameOrEmail}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-body-xs font-semibold text-foreground">
                        <span className="rounded-lg border border-border bg-muted/40 px-3 py-1.5">
                          Total Berada di Meeting:{" "}
                          <strong className="text-brand-primary">
                            {formatDurationSec(p.totalDurationSeconds)}
                          </strong>
                        </span>
                      </div>
                    </div>

                    {/* Join / Leave Sessions Visual Timeline */}
                    <div className="mt-4 space-y-3">
                      <p className="text-body-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Sesi Masuk & Keluar:
                      </p>

                      <div className="grid gap-2.5 sm:grid-cols-1 md:grid-cols-2">
                        {p.sessions.map((session, sIdx) => (
                          <div
                            key={session.sessionId || sIdx}
                            className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/20 p-3"
                          >
                            {/* GREEN BADGE - MASUK */}
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-status-success/40 bg-status-success/10 px-2.5 py-1 text-body-xs font-bold text-status-success">
                              <LogIn className="size-3.5" />
                              Masuk: {formatTimeOnly(session.startTime)}
                            </span>

                            <span className="text-muted-foreground text-body-xs font-bold">→</span>

                            {/* RED BADGE - KELUAR */}
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-status-error/40 bg-status-error/10 px-2.5 py-1 text-body-xs font-bold text-status-error">
                              <LogOut className="size-3.5" />
                              Keluar: {formatTimeOnly(session.endTime)}
                            </span>

                            <span className="ml-auto text-body-xs font-semibold text-muted-foreground">
                              ({formatDurationSec(session.durationSeconds)})
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Recordings Section */}
          {analytics.recordings.length > 0 && (
            <section className="space-y-4">
              <div className="border-b border-border pb-3">
                <h2 className="font-heading text-h5 font-bold text-foreground flex items-center gap-2">
                  <PlayCircle className="size-5 text-brand-primary" />
                  Rekaman Video Sesi
                </h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {analytics.recordings.map((rec) => (
                  <div
                    key={rec.recordingId}
                    className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm"
                  >
                    <div>
                      <p className="font-semibold text-body-sm text-foreground">
                        Rekaman Video ({formatTimeOnly(rec.startTime)} - {formatTimeOnly(rec.endTime)})
                      </p>
                      <p className="text-body-xs text-muted-foreground">Tersimpan di Google Drive</p>
                    </div>
                    {rec.driveExportUri && (
                      <a
                        href={rec.driveExportUri}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-brand-primary/30 bg-brand-primary/10 px-3 py-1.5 text-body-xs font-semibold text-brand-primary hover:bg-brand-primary/20 transition-colors"
                      >
                        Buka Drive <ExternalLink className="size-3.5" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Transcripts Section */}
          {analytics.transcripts.length > 0 && (
            <section className="space-y-4">
              <div className="border-b border-border pb-3">
                <h2 className="font-heading text-h5 font-bold text-foreground flex items-center gap-2">
                  <MessageSquare className="size-5 text-brand-primary" />
                  Transkrip Bicara Otomatis
                </h2>
              </div>
              {analytics.transcripts.map((t) => (
                <div key={t.transcriptId} className="rounded-2xl border border-border bg-card p-5 space-y-3">
                  <div className="flex items-center justify-between border-b border-border/60 pb-3">
                    <p className="text-body-xs font-semibold text-muted-foreground">
                      Transkrip ({formatTimeOnly(t.startTime)} - {formatTimeOnly(t.endTime)})
                    </p>
                    {t.docsExportUri && (
                      <a
                        href={t.docsExportUri}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-body-xs font-semibold text-brand-primary hover:underline"
                      >
                        Buka Google Docs <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>

                  <div className="max-h-96 overflow-y-auto space-y-2 pr-2">
                    {t.entries.map((entry) => (
                      <div
                        key={entry.entryId}
                        className="rounded-lg bg-muted/40 p-3 text-body-sm leading-relaxed"
                      >
                        <div className="flex items-center justify-between text-body-xs font-semibold text-muted-foreground mb-1">
                          <span>{entry.participantResourceName || "Peserta"}</span>
                          <span>{formatTimeOnly(entry.startTime)}</span>
                        </div>
                        <p className="text-foreground">{entry.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}
        </div>
      )}
    </Reveal>
  );
}
