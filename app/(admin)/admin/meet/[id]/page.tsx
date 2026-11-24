"use client";

import { MeetDetailSkeleton } from "@/components/admin/content-loading-skeletons";


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
import { AdminEmptyState } from "@/components/admin/state-panels";
import { AdminSectionTitle } from "@/components/admin/section-title";
import { Button } from "@/components/ui/button";
import { AdminIconAction } from "@/components/admin/icon-action";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";
import { useTranslations, useAppLocale } from "@/lib/i18n/client";

function meetErrorKey(rawError: string): "oauthError" | "loadError" {
  if (rawError.includes("invalid_grant") || rawError.includes("OAuth") || rawError.includes("expired or revoked")) {
    return "oauthError";
  }
  return "loadError";
}

export default function DetailedMeetingLogPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const conferenceRecordId = resolvedParams.id;
  const translate = useTranslations("adminOps");
  const { locale } = useAppLocale();

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
        setError(meetErrorKey(data.error || ""));
      }
    } catch {
      setError("loadError");
    } finally {
      setLoading(false);
    }
  }, [conferenceRecordId]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const formatTimeOnly = (isoStr?: string) => {
    if (!isoStr) return "-";
    return new Date(isoStr).toLocaleTimeString(locale === "id" ? "id-ID" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const formatDurationSec = (seconds?: number) => {
    if (!seconds && seconds !== 0) return "-";
    if (seconds < 60) return translate("meetDetailUI.seconds", { count: seconds });
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return translate("meetDetailUI.minutesSeconds", { minutes: mins, seconds: secs });
  };

  return (
    <div className="space-y-(--section-gap)">
      <AdminPageHeader
        icon={Video}
        title={translate("meetDetailUI.title")}
        backHref="/admin/meet"
        backLabel={translate("meetDetailUI.back")}
        actions={
          <AdminIconAction label={translate("meetDetailUI.reload")}
            type="button"
            variant="outline"
            onClick={fetchAnalytics}
            disabled={loading}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </AdminIconAction>
        }
      />

      {error && (
        <div role="alert" className="flex items-start gap-2 border-b border-status-error/30 pb-(--compact-gap) text-body-sm text-status-error">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{translate(`meetDetailUI.${error}`)}</p>
        </div>
      )}

      {loading ? (
        <MeetDetailSkeleton showHeader={false} />
      ) : !analytics ? (
        <AdminEmptyState compact icon={AlertCircle} title={translate("meetDetailUI.notFound")} />
      ) : (
        <div className="space-y-(--section-gap)">
          {/* Overview metric strip */}
          <AdminStatStrip className="sm:grid-cols-2 lg:grid-cols-5">
            <AdminStatStripItem
              icon={Clock}
              label={translate("meetDetailUI.timeDuration")}
              value={formatDurationSec(analytics.totalDurationSeconds)}
              caption={`${formatIsoDate(new Date(analytics.startTime))} (${formatTimeOnly(analytics.startTime)} - ${formatTimeOnly(analytics.endTime)})`}
            />
            <AdminStatStripItem icon={TrendingUp} label={translate("meetDetailUI.peak")} value={analytics.peakConcurrentParticipants} />
            <AdminStatStripItem icon={Users} label={translate("meetDetailUI.participants")} value={analytics.participantCount} />
            <AdminStatStripItem icon={PlayCircle} label={translate("meetDetailUI.recordings")} value={analytics.recordings.length} />
            <AdminStatStripItem icon={MessageSquare} label={translate("meetDetailUI.transcriptSpeech")} value={`${analytics.transcripts.reduce((acc, t) => acc + t.entries.length, 0)} ${translate("meetDetailUI.lines")}`} />
          </AdminStatStrip>

          {/* Participant Log & Session Timeline Section */}
          <section className="space-y-4">
            <AdminSectionTitle
              as="h2"
              size="h5"
              border
              icon={Users}
              title={translate("meetDetailUI.attendance")}
            />

            {analytics.participants.length === 0 ? (
              <div className="py-4 text-center text-body-xs text-muted-foreground">
                {translate("meetDetailUI.noParticipants")}
              </div>
            ) : (
              <div className="divide-y divide-border border-y border-border">
                {analytics.participants.map((p, idx) => (
                  <div
                    key={p.participantId || idx}
                    className="py-4"
                  >
                    {/* Participant Header Info */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
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
                          {translate("meetDetailUI.duration")} {" "}
                          <strong className="text-brand-primary">
                            {formatDurationSec(p.totalDurationSeconds)}
                          </strong>
                        </span>
                      </div>
                    </div>

                    {/* Join / Leave Sessions Visual Timeline */}
                    <div className="mt-2 space-y-2">
                      <p className="text-body-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {translate("meetDetailUI.sessions")}
                      </p>

                      <div className="divide-y divide-border/60">
                        {p.sessions.map((session, sIdx) => (
                          <div
                            key={session.sessionId || sIdx}
                            className="flex flex-wrap items-center gap-2 py-2"
                          >
                            {/* GREEN BADGE - MASUK */}
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-status-success/40 bg-status-success/10 px-2.5 py-1 text-body-xs font-bold text-status-success">
                              <LogIn className="size-3.5" />
                              {translate("meetDetailUI.join")}: {formatTimeOnly(session.startTime)}
                            </span>

                            <span className="text-muted-foreground text-body-xs font-bold">→</span>

                            {/* RED BADGE - KELUAR */}
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-status-error/40 bg-status-error/10 px-2.5 py-1 text-body-xs font-bold text-status-error">
                              <LogOut className="size-3.5" />
                              {translate("meetDetailUI.leave")}: {formatTimeOnly(session.endTime)}
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
            <AdminSectionTitle as="h2" size="h5" border icon={PlayCircle} title={translate("meetDetailUI.recordings")} />
            {analytics.recordings.length === 0 ? (
              <div className="py-4 text-center text-body-xs text-muted-foreground">
                {translate("meetDetailUI.noRecordings")}
              </div>
            ) : (
              <div className="divide-y divide-border border-y border-border">
                {analytics.recordings.map((rec) => (
                  <div
                    key={rec.recordingId}
                    className="flex flex-wrap items-center justify-between gap-2 py-3"
                  >
                    <div>
                      <p className="font-semibold text-body-sm text-foreground">
                        {translate("meetDetailUI.recording")} ({formatTimeOnly(rec.startTime)} - {formatTimeOnly(rec.endTime)})
                      </p>
                    </div>
                    {rec.driveExportUri ? (
                      <Button variant="outline" size="sm" asChild>
                        <a href={rec.driveExportUri} target="_blank" rel="noreferrer">
                          {translate("meetDetailUI.openDrive")} <ExternalLink className="size-3.5" />
                        </a>
                      </Button>
                    ) : (
                      <span className="rounded-md bg-muted px-2.5 py-1 text-body-xs font-medium text-muted-foreground">
                        {translate("meetDetailUI.processing")}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Transcripts Section */}
          <section className="space-y-4">
            <AdminSectionTitle as="h2" size="h5" border icon={MessageSquare} title={translate("meetDetailUI.transcripts")} />
            {analytics.transcripts.length === 0 ? (
              <AdminEmptyState icon={MessageSquare} title={translate("meetDetailUI.noTranscripts")} />
            ) : (
              <div className="divide-y divide-border border-y border-border">
                {analytics.transcripts.map((t) => (
                  <div key={t.transcriptId} className="space-y-3 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
                      <p className="text-body-xs font-bold text-foreground">
                        {translate("meetDetailUI.transcriptDocument")} ({formatTimeOnly(t.startTime)} - {formatTimeOnly(t.endTime)})
                      </p>
                      {t.docsExportUri ? (
                        <Button variant="outline" size="sm" asChild>
                          <a href={t.docsExportUri} target="_blank" rel="noreferrer">
                            {translate("meetDetailUI.openDocs")} <ExternalLink className="size-3.5" />
                          </a>
                        </Button>
                      ) : (
                        <span className="rounded-md bg-muted px-2.5 py-1 text-body-xs font-medium text-muted-foreground">
                          {translate("meetDetailUI.processing")}
                        </span>
                      )}
                    </div>

                    {t.entries.length === 0 ? (
                      <p className="text-body-sm text-muted-foreground italic">
                        {translate("meetDetailUI.noTranscriptText")}
                      </p>
                    ) : (
                      <div className="max-h-96 overflow-y-auto space-y-2.5 pr-2">
                        {t.entries.map((entry) => (
                          <div
                            key={entry.entryId}
                            className="border-b border-border/60 pb-3 last:border-0 text-body-sm leading-relaxed"
                          >
                            <div className="flex items-center justify-between text-body-xs font-semibold text-muted-foreground mb-1">
                              <span className="text-brand-primary font-bold">
                                {entry.participantResourceName || translate("meetDetailUI.participant")}
                              </span>
                              <span>{formatTimeOnly(entry.startTime)}</span>
                            </div>
                            <p className="text-foreground">{entry.text}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
