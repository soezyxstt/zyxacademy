"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import {
  BookOpen,
  CalendarCheck2,
  CalendarDays,
  Check,
  ChevronDown,
  Clock,
  FileText,
  Loader2,
  MapPin,
  Upload,
  Video,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
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
import type { LocalScheduleOperations } from "@/components/demo/use-demo-community";
import {
  getEligibleCoursesForGroupAndSlot,
  getGroupQuotaSummary,
  pickDefaultGroupId,
  resolveBookingSlotDurationMinutes,
} from "@/lib/schedule/booking-modal-helpers";
import { cn } from "@/lib/utils";

export type BookingSuccessResult = {
  bookingId: string;
  pendingResources: PendingSessionResource[];
};

type Props = {
  localOperations?: LocalScheduleOperations;
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

function formatSlotDateLabel(dateIso: string, locale: "id" | "en"): string {
  if (!dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return dateIso;
  return new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-US", {
    dateStyle: "full",
    timeZone: "UTC",
  }).format(new Date(`${dateIso}T12:00:00Z`));
}

/**
 * Modal dialog enabling students to reserve a collaborative tutorial slot
 * with their study group, course selection, and optional pre-session materials.
 */
export function CollaborativeBookingModal({
  open,
  onOpenChange,
  slot: selectedSlot,
  dateIso: selectedDateIso,
  groups,
  onSuccess,
  onSlotTaken,
  localOperations,
}: Props) {
  const t = useTranslations("schedule");
  const { locale } = useAppLocale();
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [topic, setTopic] = useState("");
  const [note, setNote] = useState("");
  const [links, setLinks] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [showOptionalMaterials, setShowOptionalMaterials] = useState(false);
  const [loading, setLoading] = useState(false);

  const selectedSlotId = selectedSlot?.id ?? null;
  const latestGroupsRef = useRef(groups);
  const latestSlotRef = useRef(selectedSlot);
  latestGroupsRef.current = groups;
  latestSlotRef.current = selectedSlot;

  useEffect(() => {
    if (!open) return;
    const currentGroups = latestGroupsRef.current;
    const currentSlot = latestSlotRef.current;
    const nextGroupId = pickDefaultGroupId(currentGroups, currentSlot);
    const nextGroup = currentGroups.find((group) => group.id === nextGroupId) || currentGroups[0] || null;
    const { eligibleCourses } = getEligibleCoursesForGroupAndSlot(nextGroup, currentSlot);
    setSelectedGroupId(nextGroupId);
    setSelectedCourseId(eligibleCourses.length === 1 ? eligibleCourses[0].id : "");
    setTopic("");
    setNote("");
    setLinks("");
    setSelectedFiles([]);
    setShowOptionalMaterials(false);
  }, [open, selectedSlotId]);

  const activeGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) || groups[0] || null,
    [groups, selectedGroupId],
  );
  const quota = useMemo(() => getGroupQuotaSummary(activeGroup), [activeGroup]);
  const { linkedCourses, eligibleCourses } = useMemo(
    () => getEligibleCoursesForGroupAndSlot(activeGroup, selectedSlot),
    [activeGroup, selectedSlot],
  );
  const parsedLinks = useMemo(
    () => links.split("\n").map((value) => value.trim()).filter(Boolean),
    [links],
  );
  const durationMinutes = useMemo(
    () => resolveBookingSlotDurationMinutes(selectedSlot?.startTime, selectedSlot?.endTime),
    [selectedSlot?.startTime, selectedSlot?.endTime],
  );
  const optionalMaterialsCount =
    (note.trim() ? 1 : 0) + parsedLinks.length + selectedFiles.length;

  const handleGroupChange = (nextGroupId: string) => {
    setSelectedGroupId(nextGroupId);
    const nextGroup = groups.find((group) => group.id === nextGroupId) || null;
    const { eligibleCourses: nextCourses } = getEligibleCoursesForGroupAndSlot(
      nextGroup,
      selectedSlot,
    );
    setSelectedCourseId(nextCourses.length === 1 ? nextCourses[0].id : "");
  };

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

  const mapBookingErrorMessage = (reason?: string): string => {
    switch (reason) {
      case "SLOT_STARTED":
        return t("booking.errors.slotStarted");
      case "SLOT_TAKEN":
        return t("booking.errors.slotTaken");
      case "GROUP_NO_MEETING_QUOTA":
        return t("booking.errors.noQuota");
      case "GROUP_QUOTA_EXHAUSTED":
        return t("booking.errors.quotaExhausted");
      case "GROUP_NOT_ACTIVE":
        return t("booking.errors.groupInactive");
      case "TUTOR_NOT_ASSIGNED":
        return t("booking.errors.tutorNotAssigned");
      case "SLOT_COURSE_NOT_ALLOWED":
        return t("booking.errors.slotCourseNotAllowed");
      case "GROUP_COURSE_NOT_ENROLLED":
        return t("booking.errors.groupCourseNotEnrolled");
      default:
        return t("booking.errors.book");
    }
  };

  const handleBook = async () => {
    if (!selectedSlot) return;
    if (!selectedGroupId || !activeGroup) {
      toast.error(t("booking.errors.chooseGroup"));
      return;
    }
    if (!quota.canBook) {
      toast.error(
        quota.isInactive
          ? t("booking.errors.groupInactive")
          : quota.isZeroQuota
            ? t("booking.errors.noQuota")
            : t("booking.errors.quotaExhausted"),
      );
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
      if (localOperations) {
        const bookingId = await localOperations.book({
          slot: selectedSlot,
          courseId: selectedCourseId,
          groupId: selectedGroupId,
          topic: topic.trim(),
          preSessionNotes: note.trim(),
          links: parsedLinks,
          files: selectedFiles,
        });
        onOpenChange(false);
        await onSuccess({ bookingId, pendingResources: [] });
        return;
      }

      const result = await bookTutorialSlot({
        slotId: selectedSlot.id,
        courseId: selectedCourseId,
        groupId: selectedGroupId,
        topic: topic.trim() || undefined,
        preSessionNotes: note.trim() || undefined,
      });

      if (!result.success || !result.bookingId) {
        toast.error(mapBookingErrorMessage(result.reason));
        if (result.reason === "SLOT_TAKEN" || result.reason === "SLOT_STARTED") {
          onOpenChange(false);
          await onSlotTaken?.();
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

  const renderQuotaBadgeText = (summary: ReturnType<typeof getGroupQuotaSummary>) => {
    if (summary.isInactive) return t("booking.groupInactive");
    if (summary.isZeroQuota) return t("booking.noQuota");
    if (summary.isExhausted) return t("booking.quotaExhausted");
    return t("booking.sessionsRemaining", { count: summary.remaining });
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !loading && onOpenChange(nextOpen)}>
      <DialogContent
        aria-describedby={undefined}
        className="flex max-h-[min(88dvh,calc(100dvh-2rem))] md:max-h-[min(88dvh,calc(100dvh-5rem))] max-w-lg flex-col gap-0 overflow-hidden rounded-xl border border-border p-0 text-left shadow-xl"
      >
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-12">
          <DialogTitle className="flex items-center gap-2 font-heading text-body-base font-bold">
            <CalendarDays className="size-4 shrink-0 text-brand-primary" aria-hidden />
            <span className="truncate">{t("booking.title")}</span>
          </DialogTitle>
        </DialogHeader>

        {selectedSlot ? (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <section className="space-y-2 border-b border-border pb-3.5">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 font-heading text-body-sm font-bold text-foreground">
                  {selectedSlot.tutor?.name || t("session.tutorFallback")}
                </span>
                <Badge variant="outline" className="shrink-0 text-body-xs">
                  {selectedSlot.mode === "online" ? (
                    <>
                      <Video className="mr-1 size-3" aria-hidden />
                      {t("session.online")}
                    </>
                  ) : (
                    <>
                      <MapPin className="mr-1 size-3" aria-hidden />
                      {selectedSlot.location || t("session.inPerson")}
                    </>
                  )}
                </Badge>
              </div>
              <div className="flex flex-col gap-1 text-body-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="size-3.5 shrink-0 text-brand-primary" aria-hidden />
                  {formatSlotDateLabel(selectedDateIso, locale)}
                </span>
                <span className="inline-flex items-center gap-1.5 tabular-nums">
                  <Clock className="size-3.5 shrink-0 text-brand-primary" aria-hidden />
                  {selectedSlot.startTime} - {selectedSlot.endTime} WIB ({t("booking.durationMinutes", { count: durationMinutes })})
                </span>
              </div>
            </section>

            <div className="space-y-1.5">
              <Label htmlFor="booking-group" className="text-body-sm font-semibold">
                {t("audit.group")}
              </Label>
              {groups.length > 1 ? (
                <Select value={selectedGroupId} onValueChange={handleGroupChange}>
                  <SelectTrigger id="booking-group" className="h-9 text-body-sm">
                    <SelectValue placeholder={t("booking.chooseGroup")} />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.map((group) => {
                      const summary = getGroupQuotaSummary(group);
                      return (
                        <SelectItem key={group.id} value={group.id} disabled={!summary.canBook}>
                          {group.name} ({renderQuotaBadgeText(summary)})
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-body-sm text-foreground">
                  <span className="min-w-0 truncate">
                    {activeGroup?.name || t("booking.groupUnavailable")}
                  </span>
                  {activeGroup ? (
                    <span
                      className={cn(
                        "shrink-0 tabular-nums text-body-xs",
                        quota.canBook ? "text-muted-foreground" : "font-medium text-destructive",
                      )}
                    >
                      {renderQuotaBadgeText(quota)}
                    </span>
                  ) : null}
                </div>
              )}
              {activeGroup && quota.isInactive ? (
                <p className="text-body-xs text-destructive">{t("booking.groupInactiveDescription")}</p>
              ) : activeGroup && quota.isZeroQuota ? (
                <p className="text-body-xs text-destructive">{t("booking.noQuotaDescription")}</p>
              ) : activeGroup && quota.isExhausted ? (
                <p className="text-body-xs text-destructive">{t("booking.quotaExhaustedDescription")}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label className="text-body-sm font-semibold">{t("academic.course")}</Label>
              {linkedCourses.length === 0 ? (
                <p className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-body-xs text-muted-foreground">
                  {t("booking.noCourses")}
                </p>
              ) : eligibleCourses.length === 0 ? (
                <p className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-body-xs text-muted-foreground">
                  {t("booking.noMatchingCourses")}
                </p>
              ) : (
                <div className="grid gap-2">
                  {eligibleCourses.map((course) => {
                    const selected = selectedCourseId === course.id;
                    return (
                      <button
                        key={course.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setSelectedCourseId(course.id)}
                        className={cn(
                          "flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          selected
                            ? "border-brand-primary bg-brand-primary/10 text-foreground"
                            : "border-border bg-card text-muted-foreground hover:bg-muted/40",
                        )}
                      >
                        <span className="inline-flex min-w-0 items-center gap-2 text-body-sm font-medium">
                          <BookOpen className="size-4 shrink-0 text-brand-primary" aria-hidden />
                          <span className="break-words">{course.title}</span>
                        </span>
                        {selected ? (
                          <Check className="size-4 shrink-0 text-brand-primary" aria-hidden />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="booking-topic" className="text-body-sm font-semibold">
                {t("booking.topicLabel")}{" "}
                <span className="font-normal text-muted-foreground">({t("booking.optional")})</span>
              </Label>
              <Input
                id="booking-topic"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder={t("booking.topicPlaceholder")}
                className="h-9 text-body-sm"
                maxLength={500}
              />
            </div>

            <div className="border-t border-border/70 pt-2">
              <button
                type="button"
                aria-expanded={showOptionalMaterials}
                onClick={() => setShowOptionalMaterials((prev) => !prev)}
                className="flex w-full items-center justify-between gap-2 py-1.5 text-left text-body-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
              >
                <span className="inline-flex items-center gap-2">
                  <span>{t("booking.optionalMaterials")}</span>
                  <span className="text-body-xs font-normal text-muted-foreground">
                    ({t("booking.optional")})
                  </span>
                  {optionalMaterialsCount > 0 ? (
                    <Badge variant="secondary" className="h-5 px-1.5 text-body-2xs tabular-nums">
                      {optionalMaterialsCount}
                    </Badge>
                  ) : null}
                </span>
                <ChevronDown
                  className={cn(
                    "size-4 shrink-0 transition-transform",
                    showOptionalMaterials && "rotate-180",
                  )}
                  aria-hidden
                />
              </button>

              {showOptionalMaterials ? (
                <div className="mt-3 space-y-3.5">
                  <div className="space-y-1.5">
                    <Label htmlFor="booking-note" className="text-body-sm font-semibold">
                      {t("booking.noteLabel")}
                    </Label>
                    <Textarea
                      id="booking-note"
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder={t("booking.notePlaceholder")}
                      className="min-h-20 text-body-sm"
                      maxLength={5000}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="booking-links" className="text-body-sm font-semibold">
                      {t("booking.linksLabel")}{" "}
                      <span className="font-normal text-muted-foreground">
                        ({t("booking.onePerLineOptional")})
                      </span>
                    </Label>
                    <Textarea
                      id="booking-links"
                      value={links}
                      onChange={(event) => setLinks(event.target.value)}
                      placeholder="https://..."
                      className="min-h-16 text-body-sm"
                    />
                    {parsedLinks.length > 0 ? (
                      <p className="text-body-xs text-muted-foreground">
                        {t("booking.linksAfterBooking", { count: parsedLinks.length })}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-body-sm font-semibold">{t("booking.filesLabel")}</Label>
                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2.5 text-body-xs font-semibold text-foreground transition-colors hover:bg-muted/40 focus-within:outline-none focus-within:ring-2 focus-within:ring-ring">
                      <Upload className="size-4 shrink-0" aria-hidden />
                      <span>{t("booking.chooseFiles")}</span>
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.webp"
                        multiple
                        className="sr-only"
                        onChange={(event) => {
                          setSelectedFiles((current) => [
                            ...current,
                            ...Array.from(event.target.files || []),
                          ]);
                          event.target.value = "";
                        }}
                      />
                    </label>
                    {selectedFiles.length > 0 ? (
                      <ul className="space-y-1.5">
                        {selectedFiles.map((file, index) => (
                          <li
                            key={`${file.name}-${file.lastModified}-${index}`}
                            className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 text-body-xs"
                          >
                            <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
                              <FileText className="size-3.5 shrink-0" aria-hidden />
                              <span className="truncate">{file.name}</span>
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              onClick={() =>
                                setSelectedFiles((current) =>
                                  current.filter((_, fileIndex) => fileIndex !== index),
                                )
                              }
                              aria-label={t("session.deleteResourceLabel", { label: file.name })}
                            >
                              <X className="size-3.5" aria-hidden />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <DialogFooter className="shrink-0 border-t border-border bg-popover px-5 py-3.5">
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => onOpenChange(false)}
            className="text-body-sm"
          >
            {t("ticket.cancel")}
          </Button>
          <Button
            type="button"
            disabled={loading || !selectedSlot || !activeGroup || !quota.canBook || !selectedCourseId}
            onClick={handleBook}
            className="bg-brand-primary text-body-sm text-white hover:bg-brand-primary/90"
          >
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {t("booking.submitting")}
              </>
            ) : (
              <>
                <CalendarCheck2 className="size-4" aria-hidden />
                {t("booking.confirm")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
