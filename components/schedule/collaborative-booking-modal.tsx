"use client";

import { useEffect, useState } from "react";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import {
  BookOpen,
  CalendarDays,
  Clock,
  FileText,
  Link2,
  Loader2,
  MapPin,
  Upload,
  Video,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { addSessionResourceAction } from "@/app/(student)/dashboard/schedule/actions";
import { bookTutorialSlot } from "@/app/(student)/dashboard/schedule/booking-actions";
import type { PendingSessionResource } from "@/components/schedule/session-detail-drawer";

export type BookingSuccessResult = {
  bookingId: string;
  pendingResources: PendingSessionResource[];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slot: any | null;
  dateIso: string;
  courses?: any[];
  groups: any[];
  onSuccess: (result: BookingSuccessResult) => void | Promise<void>;
  onSlotTaken?: () => void | Promise<void>;
};

function isHttpUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Modal dialog enabling students to reserve a collaborative tutorial slot
 * with their study group, course selection, and optional pre-session materials.
 *
 * @param props - Component props controlling modal visibility, active slot, and study groups.
 */
export function CollaborativeBookingModal({
  open,
  onOpenChange,
  slot: selectedSlot,
  dateIso: selectedDateIso,
  groups,
  onSuccess,
  onSlotTaken,
}: Props) {
  const t = useTranslations("schedule");
  const { locale } = useAppLocale();
  const [selectedGroupId, setSelectedGroupId] = useState(groups[0]?.id || "");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [topic, setTopic] = useState("");
  const [note, setNote] = useState("");
  const [links, setLinks] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedGroupId((current: string) => groups.some((group) => group.id === current) ? current : groups[0]?.id || "");
    setSelectedCourseId("");
    setTopic("");
    setNote("");
    setLinks("");
    setSelectedFiles([]);
  }, [open, selectedSlot?.id, groups]);

  const activeGroup = groups.find((group) => group.id === selectedGroupId) || groups[0] || null;
  const availableCourses = (activeGroup?.courses || [])
    .map((groupCourse: any) => groupCourse.course || groupCourse)
    .filter(Boolean);
  const parsedLinks = links.split("\n").map((value) => value.trim()).filter(Boolean);

  const uploadBookingFile = async (file: File, bookingId: string) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", `schedules/${bookingId}/materials`);
    const response = await fetch("/api/upload", { method: "POST", body: formData });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.url) throw new Error(t("booking.errors.upload"));

    const resource = await addSessionResourceAction({
      bookingId,
      phase: "pre",
      kind: "file",
      label: file.name,
      url: payload.url,
      fileName: file.name,
      mimeType: payload.type || file.type || null,
      sizeBytes: file.size,
    });
    if (!resource.success) throw new Error(t("booking.errors.attach"));
  };

  const handleBook = async () => {
    if (!selectedSlot) return;
    if (!selectedGroupId) {
      toast.error(t("booking.errors.chooseGroup"));
      return;
    }
    if (!selectedCourseId) {
      toast.error(t("booking.errors.chooseCourse"));
      return;
    }
    if (parsedLinks.some((link) => !isHttpUrl(link))) {
      toast.error(t("booking.errors.invalidUrl"));
      return;
    }

    setLoading(true);
    try {
      const result = await bookTutorialSlot({
        slotId: selectedSlot.id,
        courseId: selectedCourseId,
        groupId: selectedGroupId,
        topic: topic.trim() || undefined,
        preSessionNotes: note.trim() || undefined,
      });

      if (!result.success || !result.bookingId) {
        if (result.reason === "SLOT_TAKEN" || result.reason === "SLOT_STARTED") {
          toast.error(t(result.reason === "SLOT_STARTED" ? "booking.errors.slotStarted" : "booking.errors.slotTaken"));
          onOpenChange(false);
          await onSlotTaken?.();
        } else {
          toast.error(t("booking.errors.book"));
        }
        return;
      }

      const pendingResources: PendingSessionResource[] = [];

      for (const link of parsedLinks) {
        try {
          const resource = await addSessionResourceAction({
            bookingId: result.bookingId,
            phase: "pre",
            kind: "link",
            label: link,
            url: link,
          });
          if (!resource.success) throw new Error(t("booking.errors.saveLink"));
        } catch (error) {
          console.error("Booking link resource error:", error);
          pendingResources.push({ kind: "link", label: link, url: link });
        }
      }

      for (const file of selectedFiles) {
        try {
          await uploadBookingFile(file, result.bookingId);
        } catch (error) {
          console.error("Booking file resource error:", error);
          pendingResources.push({
            kind: "file",
            label: file.name,
            file,
            mimeType: file.type,
            sizeBytes: file.size,
          });
        }
      }

      toast.success(
        pendingResources.length > 0
          ? t("booking.successWithPending", { count: pendingResources.length })
          : t("booking.success"),
      );
      onOpenChange(false);
      setSelectedFiles([]);
      await onSuccess({ bookingId: result.bookingId, pendingResources });
    } catch (error) {
      console.error("Collaborative booking error:", error);
      toast.error(t("booking.errors.connection"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !loading && onOpenChange(nextOpen)}>
      <DialogContent className="max-w-lg rounded-xl border border-border p-6 shadow-xl text-left max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-body-base font-bold flex items-center gap-2">
            <CalendarDays className="size-5 text-brand-primary" /> {t("booking.title")}
          </DialogTitle>
          <DialogDescription className="text-body-xs text-muted-foreground">
            {t("booking.description")}
          </DialogDescription>
        </DialogHeader>

        {selectedSlot ? (
          <div className="space-y-4 py-2">
            <section className="space-y-2 border-b border-border pb-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-heading text-body-sm font-bold text-foreground">{selectedSlot.tutor?.name || t("session.tutorFallback")}</span>
                <Badge variant="outline" className="text-body-xs">
                  {selectedSlot.mode === "online" ? <><Video className="mr-1 size-3" /> {t("session.online")}</> : <><MapPin className="mr-1 size-3" /> {selectedSlot.location || t("session.inPerson")}</>}
                </Badge>
              </div>
              <div className="grid gap-1.5 text-body-xs text-muted-foreground sm:grid-cols-2">
                <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-3.5 text-brand-primary" />{new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-US", { dateStyle: "full", timeZone: "Asia/Jakarta" }).format(new Date(`${selectedDateIso}T12:00:00`))}</span>
                <span className="inline-flex items-center gap-1.5"><Clock className="size-3.5 text-brand-primary" />{selectedSlot.startTime} - {selectedSlot.endTime}, {t("booking.durationMinutes", { count: 90 })}</span>
              </div>
            </section>

            <div className="space-y-2">
              <Label htmlFor="booking-group" className="text-body-sm font-semibold">{t("audit.group")}</Label>
              {groups.length > 1 ? (
                <Select value={selectedGroupId} onValueChange={(value) => { setSelectedGroupId(value); setSelectedCourseId(""); }}>
                  <SelectTrigger id="booking-group" className="h-9 text-body-sm"><SelectValue placeholder={t("booking.chooseGroup")} /></SelectTrigger>
                  <SelectContent>{groups.map((group) => {
                    const totalQuota = group.totalQuotaSessions ?? 15;
                    const remaining = Math.max(0, totalQuota - (group.usedQuotaSessions || 0));
                    const isZeroQuota = totalQuota === 0;
                    return (
                      <SelectItem key={group.id} value={group.id} disabled={isZeroQuota || remaining === 0}>
                        {group.name} {isZeroQuota ? `(${t("booking.noQuota")})` : `(${t("booking.sessionsRemaining", { count: remaining })})`}
                      </SelectItem>
                    );
                  })}</SelectContent>
                </Select>
              ) : (
                <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-body-sm text-foreground">
                  {activeGroup?.name || t("booking.groupUnavailable")}
                  {(activeGroup?.totalQuotaSessions ?? 15) === 0 ? ` (${t("booking.noQuota")})` : ""}
                </div>
              )}
              {activeGroup && (activeGroup.totalQuotaSessions ?? 15) === 0 ? (
                <p className="text-body-xs text-destructive">
                  {t("booking.noQuotaDescription")}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label className="text-body-sm font-semibold">{t("academic.course")}</Label>
              {availableCourses.length === 0 ? (
                <p className="text-body-xs text-muted-foreground">{t("booking.noCourses")}</p>
              ) : (
                <div className="grid gap-2">
                  {availableCourses.map((course: any) => {
                    const selected = selectedCourseId === course.id;
                    return (
                      <button key={course.id} type="button" onClick={() => setSelectedCourseId(course.id)} className={`flex items-center justify-between rounded-lg border p-2.5 text-left transition-colors ${selected ? "border-brand-primary bg-brand-primary/10 text-foreground" : "border-border bg-card text-muted-foreground hover:bg-muted/40"}`}>
                        <span className="inline-flex items-center gap-2 text-body-sm"><BookOpen className="size-4 text-brand-primary" />{course.title}</span>
                        {selected ? <Badge className="text-body-xs">{t("booking.selected")}</Badge> : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="booking-topic" className="text-body-sm font-semibold">{t("booking.topicLabel")} <span className="font-normal text-muted-foreground">({t("booking.optional")})</span></Label>
              <Input id="booking-topic" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder={t("booking.topicPlaceholder")} className="h-9 text-body-sm" maxLength={500} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="booking-note" className="text-body-sm font-semibold">{t("booking.noteLabel")} <span className="font-normal text-muted-foreground">({t("booking.optional")})</span></Label>
              <Textarea id="booking-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder={t("booking.notePlaceholder")} className="min-h-20 text-body-sm" maxLength={5000} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="booking-links" className="text-body-sm font-semibold">{t("booking.linksLabel")} <span className="font-normal text-muted-foreground">({t("booking.onePerLineOptional")})</span></Label>
              <Textarea id="booking-links" value={links} onChange={(event) => setLinks(event.target.value)} placeholder="https://..." className="min-h-16 text-body-sm" />
              {parsedLinks.length > 0 ? <p className="text-body-xs text-muted-foreground">{t("booking.linksAfterBooking", { count: parsedLinks.length })}</p> : null}
            </div>

            <div className="space-y-2">
              <Label className="text-body-sm font-semibold">{t("booking.filesLabel")} <span className="font-normal text-muted-foreground">({t("booking.optional")})</span></Label>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-3 text-body-xs font-semibold text-foreground hover:bg-muted/40">
                <Upload className="size-4" /> {t("booking.chooseFiles")}
                <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" multiple className="sr-only" onChange={(event) => { setSelectedFiles((current) => [...current, ...Array.from(event.target.files || [])]); event.target.value = ""; }} />
              </label>
              {selectedFiles.length > 0 ? (
                <ul className="space-y-1.5">
                  {selectedFiles.map((file, index) => (
                    <li key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 text-body-xs">
                      <span className="inline-flex min-w-0 items-center gap-1.5 truncate"><FileText className="size-3.5 shrink-0" />{file.name}</span>
                      <Button type="button" variant="ghost" size="icon-xs" onClick={() => setSelectedFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))} aria-label={t("session.deleteResourceLabel", { label: file.name })}><X className="size-3.5" /></Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        ) : null}

        <DialogFooter className="gap-2 pt-2">
          <Button type="button" variant="outline" disabled={loading} onClick={() => onOpenChange(false)} className="text-body-sm">{t("ticket.cancel")}</Button>
          <Button type="button" disabled={loading || !selectedCourseId || (activeGroup?.totalQuotaSessions ?? 15) <= 0} onClick={handleBook} className="bg-brand-primary text-white hover:bg-brand-primary/90 text-body-sm">
            {loading ? <><Loader2 className="size-4 animate-spin" /> {t("booking.submitting")}</> : <><Link2 className="size-4" /> {t("booking.confirm")}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
