"use client";

import { useEffect, useState } from "react";
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
      label: booking.postSessionLinkTitle || "Link sesi",
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
  if (!value) return "Tanggal belum tersedia";
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
    if (!response.ok || !payload?.url) throw new Error("Berkas gagal diunggah.");

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
    if (!result.success) throw new Error("Berkas gagal ditautkan ke sesi.");
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
        toast.error(`${failedCount} berkas belum berhasil ditambahkan. Coba lagi.`);
      } else {
        toast.success(`${uploadedCount} berkas berhasil ditambahkan ke sesi.`);
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleAddLink = async (phase: "pre" | "post", kind: "link" | "recording") => {
    const value = (kind === "recording" ? recordingUrl : phase === "pre" ? preLink : postLink).trim();
    if (!validHttpUrl(value)) {
      toast.error("Masukkan URL http atau https yang valid.");
      return;
    }

    setBusyAction(`link-${phase}-${kind}`);
    try {
      const result = await addSessionResourceAction({
        bookingId: booking.id,
        phase,
        kind,
        label: kind === "recording" ? "Rekaman sesi" : value,
        url: value,
      });
      if (!result.success) {
        toast.error("Link belum berhasil ditambahkan.");
        return;
      }
      updateLocalResources(phase, [...resources[phase], result.resource]);
      if (kind === "recording") setRecordingUrl("");
      else if (phase === "pre") setPreLink("");
      else setPostLink("");
      toast.success("Link berhasil ditambahkan.");
      await refreshParent();
    } catch (error) {
      console.error("Session resource link error:", error);
      toast.error("Link belum berhasil ditambahkan.");
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
        toast.error("Resource belum berhasil dihapus.");
        return;
      }
      updateLocalResources("pre", resources.pre.filter((item) => item.id !== resource.id));
      toast.success("Resource dihapus.");
      await refreshParent();
    } catch (error) {
      console.error("Session resource delete error:", error);
      toast.error("Resource belum berhasil dihapus.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleSavePreContext = async () => {
    setBusyAction("pre-context");
    try {
      const result = await updatePreSessionContextAction(booking.id, topic, studentNote);
      if (!result.success) {
        toast.error(result.error || "Konteks sebelum sesi gagal disimpan.");
        return;
      }
      toast.success("Konteks sebelum sesi disimpan.");
      await refreshParent();
    } catch (error) {
      console.error("Pre-session context error:", error);
      toast.error("Konteks sebelum sesi gagal disimpan.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleCompleteSession = async () => {
    setBusyAction("complete");
    try {
      const result = await completeTutorSessionAction(booking.id, summary);
      if (!result.success) {
        toast.error(result.error || "Ringkasan sesi gagal disimpan.");
        return;
      }
      toast.success("Ringkasan sesi disimpan dan sesi ditandai selesai.");
      await refreshParent();
    } catch (error) {
      console.error("Complete session error:", error);
      toast.error("Ringkasan sesi gagal disimpan.");
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
        if (!result.success) throw new Error("Link gagal disimpan.");
        updateLocalResources("pre", [...resources.pre, result.resource]);
      } else {
        throw new Error("Resource tidak lengkap.");
      }

      const remaining = pendingResources.filter((item) => item !== pending);
      onPendingResourcesChange?.(remaining);
      toast.success(`${pending.label} berhasil ditambahkan.`);
      await refreshParent();
    } catch (error) {
      console.error("Retry session resource error:", error);
      toast.error(`${pending.label} belum berhasil ditambahkan.`);
    } finally {
      setBusyAction(null);
    }
  };

  const renderResources = (phase: "pre" | "post") => {
    const list = resources[phase];
    if (list.length === 0) return <p className="text-body-xs text-muted-foreground">Belum ada resource.</p>;

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
                <span className="truncate">{resource.label}</span>
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
                  aria-label={`Hapus ${resource.label}`}
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
          Tambah berkas
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
          aria-label={`Tambah link ${phase === "pre" ? "sebelum" : "sesudah"} sesi`}
        />
        <Button type="button" size="sm" variant="outline" disabled={Boolean(busyAction)} onClick={() => handleAddLink(phase, "link")} className="h-8 text-body-xs">
          <Link2 className="size-3.5" /> Tambah link
        </Button>
      </div>
    </div>
  );

  const tutorDisplayName = slot?.tutor?.name || booking.tutor?.name || tutorName || "Tutor";
  const groupDisplayName = booking.group?.name || "Kelompok";
  const courseDisplayName = booking.course?.title || "Tutorial";
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
            <SheetTitle>Detail sesi tutorial</SheetTitle>
            <SheetDescription>Kelola konteks, pelaksanaan, resource, dan aktivitas sesi dari satu tempat.</SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <section className="space-y-3 border-b border-border pb-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-heading text-body-base font-bold text-foreground">{courseDisplayName}</h2>
                  <p className="text-body-xs text-muted-foreground">{formatDate(booking.sessionDate)}, {booking.startTime || slot?.startTime || "-"} - {booking.endTime || slot?.endTime || "-"}</p>
                </div>
                <Badge variant="outline" className="text-body-xs">
                  {booking.status === "completed" ? "Selesai" : booking.status === "cancelled" ? "Batal" : "Terjadwal"}
                </Badge>
              </div>
              <div className="grid gap-2 text-body-xs text-muted-foreground sm:grid-cols-2">
                <span className="inline-flex items-center gap-1.5"><Video className="size-3.5" />{tutorDisplayName}</span>
                <span className="inline-flex items-center gap-1.5"><MessageSquare className="size-3.5" />{groupDisplayName}</span>
                <span className="inline-flex items-center gap-1.5"><Paperclip className="size-3.5" />{booking.student?.name || "Perwakilan kelompok"}</span>
                <span className="inline-flex items-center gap-1.5">{booking.mode === "online" ? <Video className="size-3.5" /> : <MapPin className="size-3.5" />}{booking.mode === "online" ? "Online" : booking.location || slot?.location || "Tatap muka"}</span>
              </div>
            </section>

            <section className="space-y-3 border-b border-border pb-4">
              <h3 className="font-heading text-body-sm font-bold text-foreground">Sebelum sesi</h3>
              <div className="space-y-2">
                <Label htmlFor="session-topic" className="text-body-sm font-semibold">Topik</Label>
                <Input id="session-topic" value={topic} onChange={(event) => setTopic(event.target.value)} readOnly={!canEditPre} className="h-9 text-body-sm" placeholder="Topik yang ingin dibahas" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="session-note" className="text-body-sm font-semibold">Catatan mahasiswa</Label>
                <Textarea id="session-note" value={studentNote} onChange={(event) => setStudentNote(event.target.value)} readOnly={!canEditPre} className="min-h-20 text-body-sm" placeholder="Catatan untuk tutor" />
              </div>
              {canEditPre ? (
                <Button type="button" size="sm" variant="outline" disabled={Boolean(busyAction)} onClick={handleSavePreContext} className="text-body-xs">
                  {busyAction === "pre-context" ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />} Simpan konteks
                </Button>
              ) : null}
              {renderResources("pre")}
              {canEditPre ? renderAddControls("pre") : null}
            </section>

            <section className="space-y-3 border-b border-border pb-4">
              <h3 className="font-heading text-body-sm font-bold text-foreground">Sesi</h3>
              {meetingUrl ? (
                <a href={meetingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-brand-primary hover:underline">
                  <Video className="size-4" /> Buka Google Meet <ExternalLink className="size-3.5" />
                </a>
              ) : (
                <p className="text-body-xs text-muted-foreground">{booking.mode === "online" ? "Link Google Meet belum tersedia." : booking.location || slot?.location || "Lokasi tatap muka belum diisi."}</p>
              )}
            </section>

            <section className="space-y-3 border-b border-border pb-4">
              <h3 className="font-heading text-body-sm font-bold text-foreground">Sesudah sesi</h3>
              <div className="space-y-2">
                <Label htmlFor="session-summary" className="text-body-sm font-semibold">Ringkasan tutor</Label>
                <Textarea id="session-summary" value={summary} onChange={(event) => setSummary(event.target.value)} readOnly={!canEditPost} className="min-h-24 text-body-sm" placeholder="Ringkasan pembahasan dan tindak lanjut" />
              </div>
              {canEditPost ? (
                <Button type="button" size="sm" disabled={Boolean(busyAction)} onClick={handleCompleteSession} className="text-body-xs bg-brand-primary text-white hover:bg-brand-primary/90">
                  {busyAction === "complete" ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />} {booking.status === "completed" ? "Simpan ringkasan" : "Simpan & selesaikan"}
                </Button>
              ) : null}
              {renderResources("post")}
              {canEditPost ? (
                <>
                  {renderAddControls("post")}
                  <div className="flex items-end gap-2 border-t border-border/70 pt-2">
                    <Input value={recordingUrl} onChange={(event) => setRecordingUrl(event.target.value)} placeholder="URL rekaman sesi" className="h-8 text-body-xs" disabled={Boolean(busyAction)} aria-label="URL rekaman sesi" />
                    <Button type="button" size="sm" variant="outline" disabled={Boolean(busyAction)} onClick={() => handleAddLink("post", "recording")} className="h-8 text-body-xs"><Video className="size-3.5" /> Tambah rekaman</Button>
                  </div>
                </>
              ) : null}
            </section>

            {pendingResources.length > 0 ? (
              <section className="space-y-2 border border-status-error/30 bg-status-error/5 p-3">
                <h3 className="text-body-sm font-semibold text-status-error">Resource belum terunggah</h3>
                <p className="text-body-xs text-muted-foreground">Booking tetap berhasil. Coba unggah ulang resource berikut.</p>
                <ul className="space-y-1.5">
                  {pendingResources.map((pending, index) => (
                    <li key={`${pending.kind}-${pending.label}-${index}`} className="flex items-center justify-between gap-2 text-body-xs">
                      <span className="truncate">{pending.label}</span>
                      <Button type="button" size="sm" variant="outline" disabled={Boolean(busyAction)} onClick={() => retryPendingResource(pending)} className="h-7 text-body-xs">
                        {busyAction === `retry-${pending.label}` ? <Loader2 className="size-3 animate-spin" /> : <RefreshCcw className="size-3" />} Coba lagi
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="space-y-2 border-b border-border pb-4">
              <h3 className="flex items-center gap-1.5 font-heading text-body-sm font-bold text-foreground"><History className="size-3.5" /> Aktivitas</h3>
              {auditLogs.length === 0 ? (
                <p className="text-body-xs text-muted-foreground">Belum ada catatan aktivitas sesi.</p>
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
                <h3 className="font-heading text-body-sm font-bold text-foreground">Override admin</h3>
                <div className="flex flex-wrap gap-2">
                  {onAdminMove ? <Button type="button" variant="outline" size="sm" onClick={() => onAdminMove(booking)} className="text-body-xs"><RefreshCcw className="size-3.5" /> Pindah sesi</Button> : null}
                  {onAdminCancel ? <Button type="button" variant="outline" size="sm" onClick={() => onAdminCancel(booking)} className="text-body-xs text-status-error hover:text-status-error"><Trash2 className="size-3.5" /> Batalkan sesi</Button> : null}
                </div>
              </section>
            ) : null}

            <section className="space-y-2">
              <h3 className="font-heading text-body-sm font-bold text-foreground">Reschedule atau pembatalan</h3>
              {tickets.length > 0 ? (
                <ul className="space-y-1.5 text-body-xs text-muted-foreground">
                  {tickets.slice(0, 3).map((ticket: any) => <li key={ticket.id}>{ticket.type === "reschedule" ? "Reschedule" : "Pembatalan"}: {ticket.status}, {ticket.reason}</li>)}
                </ul>
              ) : <p className="text-body-xs text-muted-foreground">Belum ada permohonan terkait sesi ini.</p>}
              {canOpenTicket ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setTicketOpen(true)} className="text-body-xs"><MessageSquare className="size-3.5" /> {isTutor ? "Tinjau permohonan" : "Ajukan perubahan"}</Button>
              ) : null}
              {onOpenAuditLog ? <Button type="button" variant="ghost" size="sm" onClick={() => onOpenAuditLog(booking)} className="text-body-xs"><History className="size-3.5" /> Buka riwayat lengkap</Button> : null}
            </section>
          </div>

          <SheetFooter className="border-t border-border">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Tutup</Button>
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
