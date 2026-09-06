"use client";

import { useState, useEffect, useCallback, use } from "react";
import {
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
  TrendingUp,
} from "lucide-react";
import { formatIsoDate } from "@/lib/date-utils";
import type { ComprehensiveMeetingAnalytics } from "@/lib/google-meet";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminSectionTitle } from "@/components/admin/section-title";
import { Button } from "@/components/ui/button";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";

function sanitizeMeetError(rawError: string): string {
  if (rawError.includes("invalid_grant") || rawError.includes("OAuth") || rawError.includes("expired or revoked")) {
    return "Sesi autentikasi Google OAuth kedaluwarsa atau telah dicabut. Silakan hubungkan ulang integrasi Google Workspace.";
  }
  if (rawError.startsWith("{") && rawError.endsWith("}")) {
    try {
      const parsed = JSON.parse(rawError);
      return parsed.error_description || parsed.error || "Terjadi kesalahan pada layanan Google Meet.";
    } catch {
      // fallback
    }
  }
  return rawError;
}

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
        setError(sanitizeMeetError(data.error || "Gagal memuat data log meeting."));
      }
    } catch (err: any) {
      setError(sanitizeMeetError(err.message || "Terjadi kesalahan jaringan."));
    } finally {
      setLoading(false);
    }
  }, [conferenceRecordId]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const formatTimeOnly = (isoStr?: string) => {
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
    <div className="space-y-6">
      <AdminPageHeader
        icon={Video}
        title="Detail log meeting"
        backHref="/admin/meet"
        backLabel="Kembali ke Meet"
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fetchAnalytics}
            disabled={loading}
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Muat ulang
          </Button>
        }
      />

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-status-error/30 bg-status-error/10 p-4 text-body-sm text-status-error">
          <AlertCircle className="size-5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex h-60 items-center justify-center rounded-2xl border border-border bg-card">
          <RefreshCw className="size-8 animate-spin text-brand-primary" />
        </div>
      ) : !analytics ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-12 text-center">
          <AlertCircle className="size-10 text-muted-foreground" />
          <p className="mt-3 font-heading text-body-base font-semibold text-foreground">
            Log meeting tidak ditemukan
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Overview metric strip */}
          <AdminStatStrip className="sm:grid-cols-2 lg:grid-cols-5">
            <AdminStatStripItem
              icon={Clock}
              label="Waktu dan durasi"
              value={formatDurationSec(analytics.totalDurationSeconds)}
              caption={`${formatIsoDate(new Date(analytics.startTime))} (${formatTimeOnly(analytics.startTime)} - ${formatTimeOnly(analytics.endTime)})`}
            />
            <AdminStatStripItem icon={TrendingUp} label="Peak peserta" value={analytics.peakConcurrentParticipants} tone="brand" />
            <AdminStatStripItem icon={Users} label="Total peserta" value={analytics.participantCount} />
            <AdminStatStripItem icon={PlayCircle} label="Rekaman video" value={analytics.recordings.length} />
            <AdminStatStripItem icon={MessageSquare} label="Transkrip bicara" value={`${analytics.transcripts.reduce((acc, t) => acc + t.entries.length, 0)} baris`} />
          </AdminStatStrip>

          {/* Participant Log & Session Timeline Section */}
          <section className="space-y-4">
            <AdminSectionTitle
              as="h2"
              size="h5"
              border
              icon={Users}
              title="Kehadiran peserta"
            />

            {analytics.participants.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card p-8 text-center text-body-xs text-muted-foreground">
                Tidak ada data peserta tercatat.
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
                        <div className="flex size-10 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary font-bold text-body-base">
                          {p.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-heading text-body-base font-semibold text-foreground">
                              {p.displayName}
                            </h3>
                            <span className="rounded-md bg-muted px-2 py-0.5 text-body-xs font-semibold text-muted-foreground">
                              {p.userType}
                            </span>
                          </div>
                          {p.userResourceNameOrEmail && p.userResourceNameOrEmail.includes("@") && (
                            <p className="text-body-xs font-medium text-muted-foreground">
                              {p.userResourceNameOrEmail}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-body-xs font-semibold text-foreground">
                        <span className="rounded-lg border border-border bg-muted/40 px-3 py-1.5">
                          Durasi:{" "}
                          <strong className="text-brand-primary">
                            {formatDurationSec(p.totalDurationSeconds)}
                          </strong>
                        </span>
                      </div>
                    </div>

                    {/* Join / Leave Sessions Visual Timeline */}
                    <div className="mt-4 space-y-3">
                      <p className="text-body-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Sesi:
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
          <section className="space-y-4">
            <AdminSectionTitle as="h2" size="h5" border icon={PlayCircle} title="Rekaman video" />
            {analytics.recordings.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card p-6 text-center text-body-xs text-muted-foreground">
                Belum ada rekaman video untuk sesi ini.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {analytics.recordings.map((rec) => (
                  <div
                    key={rec.recordingId}
                    className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm"
                  >
                    <div>
                      <p className="font-semibold text-body-sm text-foreground">
                        Rekaman ({formatTimeOnly(rec.startTime)} - {formatTimeOnly(rec.endTime)})
                      </p>
                    </div>
                    {rec.driveExportUri ? (
                      <Button variant="outline" size="sm" asChild>
                        <a href={rec.driveExportUri} target="_blank" rel="noreferrer">
                          Buka Google Drive <ExternalLink className="size-3.5" />
                        </a>
                      </Button>
                    ) : (
                      <span className="rounded-md bg-muted px-2.5 py-1 text-body-xs font-medium text-muted-foreground">
                        Sedang diproses
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Transcripts Section */}
          <section className="space-y-4">
            <AdminSectionTitle as="h2" size="h5" border icon={MessageSquare} title="Transkrip" />
            {analytics.transcripts.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card p-6 text-center text-body-xs text-muted-foreground">
                Belum ada transkrip ucapan untuk sesi ini.
              </div>
            ) : (
              analytics.transcripts.map((t) => (
                <div key={t.transcriptId} className="rounded-2xl border border-border bg-card p-5 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between border-b border-border/60 pb-3">
                    <p className="text-body-xs font-bold text-foreground">
                      Dokumen transkrip ({formatTimeOnly(t.startTime)} - {formatTimeOnly(t.endTime)})
                    </p>
                    {t.docsExportUri ? (
                      <Button variant="outline" size="sm" asChild>
                        <a href={t.docsExportUri} target="_blank" rel="noreferrer">
                          Buka Google Docs <ExternalLink className="size-3.5" />
                        </a>
                      </Button>
                    ) : (
                      <span className="rounded-md bg-muted px-2.5 py-1 text-body-xs font-medium text-muted-foreground">
                        Sedang diproses
                      </span>
                    )}
                  </div>

                  {t.entries.length === 0 ? (
                    <p className="text-body-sm text-muted-foreground italic">
                      Tidak ada entri teks percakapan yang terekam.
                    </p>
                  ) : (
                    <div className="max-h-96 overflow-y-auto space-y-2.5 pr-2">
                      {t.entries.map((entry) => (
                        <div
                          key={entry.entryId}
                          className="rounded-xl border border-border bg-muted/30 p-3 text-body-sm leading-relaxed"
                        >
                          <div className="flex items-center justify-between text-body-xs font-semibold text-muted-foreground mb-1">
                            <span className="text-brand-primary font-bold">
                              {entry.participantResourceName || "Peserta"}
                            </span>
                            <span>{formatTimeOnly(entry.startTime)}</span>
                          </div>
                          <p className="text-foreground">{entry.text}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </section>
        </div>
      )}
    </div>
  );
}
