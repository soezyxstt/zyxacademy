"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n/client";
import {
  CheckCircle2,
  ExternalLink,
  FileText,
  History,
  Link2,
  Loader2,
  MapPin,
  MessageSquare,
  Paperclip,
  RefreshCcw,
  Trash2,
  Upload,
  Video,
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { RescheduleTicketModal } from "@/components/schedule/reschedule-ticket-modal";
import {
  addSessionResourceAction,
  completeTutorSessionAction,
  deleteSessionResourceAction,
  updatePreSessionContextAction,
} from "@/app/(student)/dashboard/schedule/actions";
import type { SessionResource } from "@/lib/schedule/session-resources";
import { formatIsoDate } from "@/lib/date-utils";

export type PendingSessionResource = {
  kind: "file" | "link";
  label: string;
  url?: string;
  file?: File;
  mimeType?: string;
  sizeBytes?: number;
};

type SessionDetailDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: any | null;
  role?: "student" | "teacher" | "admin";
  currentUserId?: string;
  isAdmin?: boolean;
  onAdminMove?: (booking: any) => void;
  onAdminCancel?: (booking: any) => void;
  onOpenAuditLog?: (booking: any) => void;
  tutorName?: string | null;
  availableSlots?: any[];
  pendingResources?: PendingSessionResource[];
  onPendingResourcesChange?: (resources: PendingSessionResource[]) => void;
  onSuccess?: () => void | Promise<void>;
};

type DrawerResource = Pick<
  SessionResource,
  "id" | "phase" | "kind" | "label" | "url" | "fileName" | "mimeType" | "sizeBytes" | "createdById"
> & {
  createdAt?: Date | string;
};

function legacyResources(booking: any, phase: "pre" | "post"): DrawerResource[] {
  const attachments = phase === "pre" ? booking?.preSessionAttachments : booking?.postSessionAttachments;
  const rows = Array.isArray(attachments) ? attachments : [];
  const resources: DrawerResource[] = rows
    .filter((item: any) => item?.url && item?.name)
    .map((item: any) => ({
      id: `legacy-${phase}-${item.id || item.url}`,
      phase,
      kind: "file" as const,
      label: item.name,
      url: item.url,
      fileName: item.name,
      mimeType: item.type || null,
      sizeBytes: item.size || null,
      createdById: item.uploadedBy || "legacy",
    }));

  if (phase === "post" && booking?.postSessionLinkUrl) {
    resources.push({
      id: "legacy-post-link",
      phase,
      kind: "link",
      label: booking.postSessionLinkTitle || "",
      url: booking.postSessionLinkUrl,
      fileName: null,
      mimeType: null,
      sizeBytes: null,
      createdById: "legacy",
    });
  }
  return resources;
}

function resourcesFor(booking: any, phase: "pre" | "post"): DrawerResource[] {
  const dedicated = phase === "pre" ? booking?.preSessionResources : booking?.postSessionResources;
  const normalized = Array.isArray(booking?.resources)
    ? booking.resources.filter((resource: DrawerResource) => resource.phase === phase)
    : [];
  const resources = normalized.length > 0 ? normalized : Array.isArray(dedicated) ? dedicated : [];
  return resources.length > 0 ? resources : legacyResources(booking, phase);
}

function formatSize(size: number | null | undefined) {
  if (!size || size < 1024) return size ? `${size} B` : "";
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "";
  try {
    return formatIsoDate(value instanceof Date ? value : new Date(`${value}T12:00:00`));
  } catch {
    return String(value);
  }
}

function validHttpUrl(value: string) {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function resourceIcon(kind: DrawerResource["kind"]) {
  if (kind === "link") return <Link2 className="size-3.5 shrink-0" />;
  if (kind === "recording") return <Video className="size-3.5 shrink-0" />;
  return <FileText className="size-3.5 shrink-0" />;
}

export function SessionDetailDrawer({
  open,
  onOpenChange,
  booking,
  role,
  currentUserId = "",
  isAdmin = false,
  onAdminMove,
  onAdminCancel,
  onOpenAuditLog,
  tutorName,
  availableSlots = [],
  pendingResources = [],
  onPendingResourcesChange,
  onSuccess,
}: SessionDetailDrawerProps) {
  const t = useTranslations("schedule");
  const effectiveRole = isAdmin ? "admin" : role || "student";
  const effectiveCurrentUserId = currentUserId;
  const isStudent = effectiveRole === "student";
  const isTutor = effectiveRole === "teacher";
  const canEditPre = isStudent && booking?.status !== "completed" && booking?.status !== "cancelled";
  const canEditPost = isTutor && booking?.status !== "cancelled";
  const slot = booking?.slot;

  const [resources, setResources] = useState<{ pre: DrawerResource[]; post: DrawerResource[] }>({
    pre: [],
    post: [],
  });
  const [topic, setTopic] = useState("");
  const [studentNote, setStudentNote] = useState("");
  const [summary, setSummary] = useState("");
  const [preLink, setPreLink] = useState("");
  const [postLink, setPostLink] = useState("");
  const [recordingUrl, setRecordingUrl] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [ticketOpen, setTicketOpen] = useState(false);

  useEffect(() => {
    setResources({ pre: resourcesFor(booking, "pre"), post: resourcesFor(booking, "post") });
    setTopic(booking?.topic || "");
    setStudentNote(booking?.preSessionNotes || "");
    setSummary(booking?.postSessionNotes || "");
    setPreLink("");
    setPostLink("");
    setRecordingUrl("");
    setTicketOpen(false);
  }, [booking]);

  if (!booking) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-xl" />
      </Sheet>
    );
  }

  const updateLocalResources = (phase: "pre" | "post", next: DrawerResource[]) => {
    setResources((current) => ({ ...current, [phase]: next }));
  };

  const refreshParent = async () => {
    await onSuccess?.();
  };

  const uploadAndStoreFile = async (file: File, phase: "pre" | "post") => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", `schedules/${booking.id}/${phase === "pre" ? "materials" : "notes"}`);

    const response = await fetch("/api/upload", { method: "POST", body: formData });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.url) throw new Error(t("session.errors.upload"));

    const result = await addSessionResourceAction({
      bookingId: booking.id,
      phase,
      kind: "file",
      label: file.name,
      url: payload.url,
      fileName: file.name,
      mimeType: payload.type || file.type || null,
      sizeBytes: file.size,
    });
    if (!result.success) throw new Error(t("session.errors.attach"));
    setResources((current) => ({
      ...current,
      [phase]: [...current[phase], result.resource],
    }));
  };

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>, phase: "pre" | "post") => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    setBusyAction(`upload-${phase}`);
    let uploadedCount = 0;
    let failedCount = 0;
    try {
      for (const file of files) {
        try {
          await uploadAndStoreFile(file, phase);
          uploadedCount += 1;
        } catch (error) {
          failedCount += 1;
          console.error("Session resource upload error:", error);
        }
      }
      if (uploadedCount > 0) await refreshParent();
      if (failedCount > 0) {
        toast.error(t("session.uploadFailed", { count: failedCount }));
      } else {
        toast.success(t("session.uploaded", { count: uploadedCount }));
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleAddLink = async (phase: "pre" | "post", kind: "link" | "recording") => {
    const value = (kind === "recording" ? recordingUrl : phase === "pre" ? preLink : postLink).trim();
    if (!validHttpUrl(value)) {
      toast.error(t("session.errors.invalidUrl"));
      return;
    }

    setBusyAction(`link-${phase}-${kind}`);
    try {
      const result = await addSessionResourceAction({
        bookingId: booking.id,
        phase,
        kind,
        label: kind === "recording" ? t("session.recording") : value,
        url: value,
      });
      if (!result.success) {
        toast.error(t("session.errors.addLink"));
        return;
      }
      updateLocalResources(phase, [...resources[phase], result.resource]);
      if (kind === "recording") setRecordingUrl("");
      else if (phase === "pre") setPreLink("");
      else setPostLink("");
      toast.success(t("session.linkAdded"));
      await refreshParent();
    } catch (error) {
      console.error("Session resource link error:", error);
      toast.error(t("session.errors.addLink"));
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeleteResource = async (resource: DrawerResource) => {
    if (!isStudent || resource.phase !== "pre" || resource.createdById !== effectiveCurrentUserId) return;
    setBusyAction(`delete-${resource.id}`);
    try {
      const result = await deleteSessionResourceAction(resource.id);
      if (!result.success) {
        toast.error(t("session.errors.deleteResource"));
        return;
      }
      updateLocalResources("pre", resources.pre.filter((item) => item.id !== resource.id));
      toast.success(t("session.resourceDeleted"));
      await refreshParent();
    } catch (error) {
      console.error("Session resource delete error:", error);
      toast.error(t("session.errors.deleteResource"));
    } finally {
      setBusyAction(null);
    }
  };

  const handleSavePreContext = async () => {
    setBusyAction("pre-context");
    try {
      const result = await updatePreSessionContextAction(booking.id, topic, studentNote);
      if (!result.success) {
        toast.error(t("session.errors.saveContext"));
        return;
      }
      toast.success(t("session.contextSaved"));
      await refreshParent();
    } catch (error) {
      console.error("Pre-session context error:", error);
      toast.error(t("session.errors.saveContext"));
    } finally {
      setBusyAction(null);
    }
  };

  const handleCompleteSession = async () => {
    setBusyAction("complete");
    try {
      const result = await completeTutorSessionAction(booking.id, summary);
      if (!result.success) {
        toast.error(t("session.errors.saveSummary"));
        return;
      }
      toast.success(t("session.summaryCompleted"));
      await refreshParent();
    } catch (error) {
      console.error("Complete session error:", error);
      toast.error(t("session.errors.saveSummary"));
    } finally {
      setBusyAction(null);
    }
  };

  const retryPendingResource = async (pending: PendingSessionResource) => {
    setBusyAction(`retry-${pending.label}`);
    try {
      if (pending.kind === "file" && pending.file) {
        await uploadAndStoreFile(pending.file, "pre");
      } else if (pending.kind === "link" && pending.url) {
        const result = await addSessionResourceAction({
          bookingId: booking.id,
          phase: "pre",
          kind: "link",
          label: pending.label,
          url: pending.url,
        });
        if (!result.success) throw new Error(t("session.errors.addLink"));
        updateLocalResources("pre", [...resources.pre, result.resource]);
      } else {
        throw new Error(t("session.errors.incompleteResource"));
      }

      const remaining = pendingResources.filter((item) => item !== pending);
      onPendingResourcesChange?.(remaining);
      toast.success(t("session.pendingAdded", { label: pending.label }));
      await refreshParent();
    } catch (error) {
      console.error("Retry session resource error:", error);
      toast.error(t("session.pendingFailed", { label: pending.label }));
    } finally {
      setBusyAction(null);
    }
  };

  const renderResources = (phase: "pre" | "post") => {
    const list = resources[phase];
    if (list.length === 0) return <p className="text-body-xs text-muted-foreground">{t("session.noResources")}</p>;

    return (
      <ul className="space-y-1.5">
        {list.map((resource) => {
          const canDelete = isStudent && phase === "pre" && resource.createdById === effectiveCurrentUserId;
          return (
            <li key={resource.id} className="flex min-w-0 items-center gap-2">
              <a
                href={resource.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-body-xs font-semibold text-brand-primary hover:underline"
              >
                {resourceIcon(resource.kind)}
                <span className="truncate">{resource.label || t("session.sessionLink")}</span>
                {formatSize(resource.sizeBytes) ? <span className="shrink-0 font-normal text-muted-foreground">{formatSize(resource.sizeBytes)}</span> : null}
                <ExternalLink className="size-3 shrink-0" />
              </a>
              {canDelete ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  disabled={busyAction === `delete-${resource.id}`}
                  onClick={() => handleDeleteResource(resource)}
                  aria-label={t("session.deleteResourceLabel", { label: resource.label })}
                  className="text-muted-foreground hover:text-status-error"
                >
                  {busyAction === `delete-${resource.id}` ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    );
  };

  const renderAddControls = (phase: "pre" | "post") => (
    <div className="space-y-2 border-t border-border/70 pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-body-xs font-semibold text-foreground hover:bg-muted">
          <Upload className="size-3.5" />
          {t("session.addFile")}
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            multiple
            className="sr-only"
            disabled={Boolean(busyAction)}
            onChange={(event) => handleFileSelected(event, phase)}
          />
        </label>
        {busyAction === `upload-${phase}` ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
      </div>
      <div className="flex items-end gap-2">
        <Input
          value={phase === "pre" ? preLink : postLink}
          onChange={(event) => (phase === "pre" ? setPreLink(event.target.value) : setPostLink(event.target.value))}
          placeholder="https://..."
          className="h-8 text-body-xs"
          disabled={Boolean(busyAction)}
          aria-label={t("session.addLinkLabel", { phase: t(phase === "pre" ? "session.before" : "session.after") })}
        />
        <Button type="button" size="sm" variant="outline" disabled={Boolean(busyAction)} onClick={() => handleAddLink(phase, "link")} className="h-8 text-body-xs">
          <Link2 className="size-3.5" /> {t("session.addLink")}
        </Button>
      </div>
    </div>
  );

  const tutorDisplayName = slot?.tutor?.name || booking.tutor?.name || tutorName || t("session.tutorFallback");
  const groupDisplayName = booking.group?.name || t("session.groupFallback");
  const courseDisplayName = booking.course?.title || t("session.courseFallback");
  const meetingUrl = booking.googleMeetUrl || slot?.googleMeetUrl;
  const auditLogs = Array.isArray(booking.auditLogs) ? booking.auditLogs : [];
  const tickets = Array.isArray(booking.rescheduleTickets) ? booking.rescheduleTickets : [];
  const canOpenTicket = isStudent
    ? booking.status !== "completed" && booking.status !== "cancelled"
    : isTutor && tickets.length > 0;

  return (
    <>
      <Sheet open={open} onOpenChange={(nextOpen) => !busyAction && onOpenChange(nextOpen)}>
        <SheetContent side="right" className="w-full sm:max-w-xl">
          <SheetHeader className="border-b border-border pr-12">
            <SheetTitle>{t("session.title")}</SheetTitle>
            <SheetDescription className="sr-only">{t("session.title")}</SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <section className="space-y-3 border-b border-border pb-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-heading text-body-base font-bold text-foreground">{courseDisplayName}</h2>
                  <p className="text-body-xs text-muted-foreground">{formatDate(booking.sessionDate) || t("session.dateUnavailable")}, {booking.startTime || slot?.startTime || "-"} - {booking.endTime || slot?.endTime || "-"}</p>
                </div>
                <Badge variant="outline" className="text-body-xs">
                  {booking.status === "completed" ? t("session.status.completed") : booking.status === "cancelled" ? t("session.status.cancelled") : t("session.status.scheduled")}
                </Badge>
              </div>
              <div className="grid gap-2 text-body-xs text-muted-foreground sm:grid-cols-2">
                <span className="inline-flex items-center gap-1.5"><Video className="size-3.5" />{tutorDisplayName}</span>
                <span className="inline-flex items-center gap-1.5"><MessageSquare className="size-3.5" />{groupDisplayName}</span>
                <span className="inline-flex items-center gap-1.5"><Paperclip className="size-3.5" />{booking.student?.name || t("session.groupRepresentative")}</span>
                <span className="inline-flex items-center gap-1.5">{booking.mode === "online" ? <Video className="size-3.5" /> : <MapPin className="size-3.5" />}{booking.mode === "online" ? t("session.online") : booking.location || slot?.location || t("session.inPerson")}</span>
              </div>
            </section>

            <section className="space-y-3 border-b border-border pb-4">
              <h3 className="font-heading text-body-sm font-bold text-foreground">{t("session.before")}</h3>
              <div className="space-y-2">
                <Label htmlFor="session-topic" className="text-body-sm font-semibold">{t("session.topic")}</Label>
                <Input id="session-topic" value={topic} onChange={(event) => setTopic(event.target.value)} readOnly={!canEditPre} className="h-9 text-body-sm" placeholder={t("session.topicPlaceholder")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="session-note" className="text-body-sm font-semibold">{t("session.studentNote")}</Label>
                <Textarea id="session-note" value={studentNote} onChange={(event) => setStudentNote(event.target.value)} readOnly={!canEditPre} className="min-h-20 text-body-sm" placeholder={t("session.studentNotePlaceholder")} />
              </div>
              {canEditPre ? (
                <Button type="button" size="sm" variant="outline" disabled={Boolean(busyAction)} onClick={handleSavePreContext} className="text-body-xs">
                  {busyAction === "pre-context" ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />} {t("session.saveContext")}
                </Button>
              ) : null}
              {renderResources("pre")}
              {canEditPre ? renderAddControls("pre") : null}
            </section>

            <section className="space-y-3 border-b border-border pb-4">
              <h3 className="font-heading text-body-sm font-bold text-foreground">{t("session.session")}</h3>
              {meetingUrl ? (
                <a href={meetingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-brand-primary hover:underline">
                  <Video className="size-4" /> {t("session.openMeet")} <ExternalLink className="size-3.5" />
                </a>
              ) : (
                <p className="text-body-xs text-muted-foreground">{booking.mode === "online" ? t("session.meetUnavailable") : booking.location || slot?.location || t("session.locationUnavailable")}</p>
              )}
            </section>

            <section className="space-y-3 border-b border-border pb-4">
              <h3 className="font-heading text-body-sm font-bold text-foreground">{t("session.after")}</h3>
              <div className="space-y-2">
                <Label htmlFor="session-summary" className="text-body-sm font-semibold">{t("session.tutorSummary")}</Label>
                <Textarea id="session-summary" value={summary} onChange={(event) => setSummary(event.target.value)} readOnly={!canEditPost} className="min-h-24 text-body-sm" placeholder={t("session.summaryPlaceholder")} />
              </div>
              {canEditPost ? (
                <Button type="button" size="sm" disabled={Boolean(busyAction)} onClick={handleCompleteSession} className="text-body-xs bg-brand-primary text-white hover:bg-brand-primary/90">
                  {busyAction === "complete" ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />} {booking.status === "completed" ? t("session.saveSummary") : t("session.saveAndComplete")}
                </Button>
              ) : null}
              {renderResources("post")}
              {canEditPost ? (
                <>
                  {renderAddControls("post")}
                  <div className="flex items-end gap-2 border-t border-border/70 pt-2">
                    <Input value={recordingUrl} onChange={(event) => setRecordingUrl(event.target.value)} placeholder={t("session.recordingUrl")} className="h-8 text-body-xs" disabled={Boolean(busyAction)} aria-label={t("session.recordingUrl")} />
                    <Button type="button" size="sm" variant="outline" disabled={Boolean(busyAction)} onClick={() => handleAddLink("post", "recording")} className="h-8 text-body-xs"><Video className="size-3.5" /> {t("session.addRecording")}</Button>
                  </div>
                </>
              ) : null}
            </section>

            {pendingResources.length > 0 ? (
              <section className="space-y-2 border border-status-error/30 bg-status-error/5 p-3">
                <h3 className="text-body-sm font-semibold text-status-error">{t("session.pendingResources")}</h3>
                <p className="text-body-xs text-muted-foreground">{t("session.pendingResourcesDescription")}</p>
                <ul className="space-y-1.5">
                  {pendingResources.map((pending, index) => (
                    <li key={`${pending.kind}-${pending.label}-${index}`} className="flex items-center justify-between gap-2 text-body-xs">
                      <span className="truncate">{pending.label}</span>
                      <Button type="button" size="sm" variant="outline" disabled={Boolean(busyAction)} onClick={() => retryPendingResource(pending)} className="h-7 text-body-xs">
                        {busyAction === `retry-${pending.label}` ? <Loader2 className="size-3 animate-spin" /> : <RefreshCcw className="size-3" />} {t("session.retry")}
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="space-y-2 border-b border-border pb-4">
              <h3 className="flex items-center gap-1.5 font-heading text-body-sm font-bold text-foreground"><History className="size-3.5" /> {t("session.activity")}</h3>
              {auditLogs.length === 0 ? (
                <p className="text-body-xs text-muted-foreground">{t("session.noActivity")}</p>
              ) : (
                <ul className="space-y-2">
                  {auditLogs.slice(0, 12).map((log: any) => (
                    <li key={log.id} className="text-body-xs text-muted-foreground"><span className="font-semibold text-foreground">{log.summary}</span><span className="ml-1">{log.createdAt ? `, ${formatDate(log.createdAt)}` : ""}</span></li>
                  ))}
                </ul>
              )}
            </section>

            {effectiveRole === "admin" && (onAdminMove || onAdminCancel) ? (
              <section className="space-y-2 border-b border-border pb-4">
                <h3 className="font-heading text-body-sm font-bold text-foreground">{t("session.adminOverride")}</h3>
                <div className="flex flex-wrap gap-2">
                  {onAdminMove ? <Button type="button" variant="outline" size="sm" onClick={() => onAdminMove(booking)} className="text-body-xs"><RefreshCcw className="size-3.5" /> {t("session.moveSession")}</Button> : null}
                  {onAdminCancel ? <Button type="button" variant="outline" size="sm" onClick={() => onAdminCancel(booking)} className="text-body-xs text-status-error hover:text-status-error"><Trash2 className="size-3.5" /> {t("session.cancelSession")}</Button> : null}
                </div>
              </section>
            ) : null}

            <section className="space-y-2">
              <h3 className="font-heading text-body-sm font-bold text-foreground">{t("session.changeOrCancel")}</h3>
              {tickets.length > 0 ? (
                <ul className="space-y-1.5 text-body-xs text-muted-foreground">
                  {tickets.slice(0, 3).map((ticket: any) => <li key={ticket.id}>{ticket.type === "reschedule" ? t("ticket.reschedule") : t("ticket.cancellation")}: {ticket.status === "approved" ? t("ticket.status.approved") : ticket.status === "rejected" ? t("ticket.status.rejected") : t("ticket.status.pending")}, {ticket.reason}</li>)}
                </ul>
              ) : <p className="text-body-xs text-muted-foreground">{t("session.noTickets")}</p>}
              {canOpenTicket ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setTicketOpen(true)} className="text-body-xs"><MessageSquare className="size-3.5" /> {isTutor ? t("session.reviewRequest") : t("session.requestChange")}</Button>
              ) : null}
              {onOpenAuditLog ? <Button type="button" variant="ghost" size="sm" onClick={() => onOpenAuditLog(booking)} className="text-body-xs"><History className="size-3.5" /> {t("session.openFullHistory")}</Button> : null}
            </section>
          </div>

          <SheetFooter className="border-t border-border">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("session.close")}</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <RescheduleTicketModal
        open={ticketOpen}
        onOpenChange={setTicketOpen}
        booking={booking}
        role={effectiveRole}
        currentUserId={effectiveCurrentUserId}
        availableSlots={availableSlots}
        onSuccess={refreshParent}
      />
    </>
  );
}
