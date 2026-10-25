"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CalendarDays } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { ApplicationPage } from "@/components/application-page";
import { getScheduleData } from "./actions";
import { ScheduleCalendarView } from "@/components/schedule/schedule-calendar-view";
import calendarStyles from "@/components/schedule/schedule-calendar-readability.module.css";
import { CollaborativeBookingModal } from "@/components/schedule/collaborative-booking-modal";
import {
  AcademicScheduleDetailDialog,
  type AcademicScheduleDetail,
} from "@/components/schedule/academic-schedule-detail-dialog";
import {
  SessionDetailDrawer,
  type PendingSessionResource,
} from "@/components/schedule/session-detail-drawer";
import { useTranslations } from "@/lib/i18n/client";

function LoadingState() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-brand-primary" />
    </div>
  );
}

function getCourseFilterOptions(data: any, fallbackTitle: string) {
  const byId = new Map<string, { id: string; title: string }>();
  for (const enrollment of data.enrollments || []) {
    const course = enrollment?.course;
    if (course?.id) byId.set(course.id, { id: course.id, title: course.title || course.name || fallbackTitle });
  }
  for (const group of data.groups || []) {
    for (const entry of group?.courses || []) {
      const course = entry?.course || entry;
      if (course?.id) byId.set(course.id, { id: course.id, title: course.title || course.name || fallbackTitle });
    }
  }
  return Array.from(byId.values()).sort((left, right) => left.title.localeCompare(right.title, "id"));
}

function getTutorFilterOptions(data: any, fallbackName: string) {
  const byId = new Map<string, { id: string; name: string }>();
  for (const slot of data.availableSlots || []) {
    const tutor = slot?.tutor;
    const id = tutor?.id || slot?.tutorId;
    if (id) byId.set(id, { id, name: tutor?.name || fallbackName });
  }
  return Array.from(byId.values()).sort((left, right) => left.name.localeCompare(right.name, "id"));
}

export function StudentScheduleClient() {
  const t = useTranslations("student");
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const [data, setData] = useState<any>(null);
  const [dataWeekOffset, setDataWeekOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [bookingSlotData, setBookingSlotData] = useState<{ slot: any; dateIso: string } | null>(null);
  const [activeSessionBookingId, setActiveSessionBookingId] = useState<string | null>(null);
  const [selectedAcademicSchedule, setSelectedAcademicSchedule] = useState<AcademicScheduleDetail | null>(null);
  const [pendingSessionResources, setPendingSessionResources] = useState<PendingSessionResource[]>([]);
  const searchParams = useSearchParams();
  const weekCache = useRef(new Map<number, any>());
  const activeRequest = useRef(0);

  const fetchData = useCallback(async (offset: number, force = false) => {
    const requestId = ++activeRequest.current;
    const cached = !force ? weekCache.current.get(offset) : null;
    if (cached) {
      setData(cached);
      setDataWeekOffset(offset);
      setLoadError(false);
      setLoading(false);
      return cached;
    }

    try {
      setLoading(true);
      setLoadError(false);
      const nextData = await getScheduleData(offset);
      weekCache.current.set(offset, nextData);
      if (requestId === activeRequest.current) {
        setData(nextData);
        setDataWeekOffset(offset);
        setLoadError(false);
      }
      return nextData;
    } catch (error) {
      console.error("Gagal mengambil data jadwal:", error);
      if (requestId === activeRequest.current) {
        setLoadError(true);
        toast.error(tRef.current("schedule.loadFailedToast"));
      }
      return null;
    } finally {
      if (requestId === activeRequest.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchData(weekOffset);
  }, [fetchData, weekOffset]);

  useEffect(() => {
    if (!data || loading || dataWeekOffset !== weekOffset) return;

    for (const adjacentOffset of [weekOffset - 1, weekOffset + 1]) {
      if (weekCache.current.has(adjacentOffset)) continue;
      void getScheduleData(adjacentOffset)
        .then((adjacentData) => {
          weekCache.current.set(adjacentOffset, adjacentData);
        })
        .catch(() => undefined);
    }
  }, [data, dataWeekOffset, loading, weekOffset]);

  const activeData = dataWeekOffset === weekOffset ? data : null;
  if (!activeData) {
    if (loadError) {
      return (
        <ApplicationPage spacing="space-y-4">
          <PageHeader icon={CalendarDays} title={t("schedule.title")} />
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
              <div className="min-w-0 space-y-3">
                <div>
                  <h2 className="font-heading text-body-base font-semibold text-foreground">{t("schedule.loadFailedTitle")}</h2>
                  <p className="mt-1 text-body-sm text-muted-foreground">{t("schedule.loadFailedDescription")}</p>
                </div>
                <Button type="button" size="sm" onClick={() => void fetchData(weekOffset, true)} disabled={loading}>
                  {loading ? t("schedule.loading") : t("schedule.retry")}
                </Button>
              </div>
            </div>
          </div>
        </ApplicationPage>
      );
    }
    return <LoadingState />;
  }

  const userObj = activeData.user || {};
  const coursesList = getCourseFilterOptions(activeData, t("schedule.courseFallback"));
  const tutorsList = getTutorFilterOptions(activeData, t("schedule.tutorFallback"));
  const initialCourseFilter = searchParams.get("course") || "all";
  const activeSessionBooking = activeSessionBookingId
    ? (activeData.groupBookings || []).find((booking: any) => booking.id === activeSessionBookingId) || null
    : null;

  return (
    <ApplicationPage spacing="space-y-4">
      <PageHeader icon={CalendarDays} title={t("schedule.title")} />

      <div className={calendarStyles.root} aria-busy={loading}>
        <ScheduleCalendarView
          role="student"
          currentUserId={userObj.id}
          weekInfo={activeData.weekInfo}
          isWeekLocked={activeData.isWeekLocked}
          weekOffset={weekOffset}
          onWeekChange={setWeekOffset}
          coursesList={coursesList}
          tutorsList={tutorsList}
          groupsList={activeData.groups || []}
          initialCourseFilter={initialCourseFilter}
          slots={activeData.availableSlots || []}
          bookings={activeData.groupBookings || []}
          academicSchedules={activeData.academicSchedules || []}
          onSelectSlotToBook={(slot, dateIso) => setBookingSlotData({ slot, dateIso })}
          onOpenSessionDetail={(booking) => setActiveSessionBookingId(booking.id)}
          onEditSchedule={(schedule) => setSelectedAcademicSchedule(schedule)}
        />
      </div>

      <CollaborativeBookingModal
        open={Boolean(bookingSlotData)}
        onOpenChange={(open) => {
          if (!open) setBookingSlotData(null);
        }}
        slot={bookingSlotData?.slot || null}
        dateIso={bookingSlotData?.dateIso || ""}
        courses={coursesList}
        groups={activeData.groups || []}
        onSuccess={async ({ bookingId, pendingResources }) => {
          setPendingSessionResources(pendingResources);
          weekCache.current.delete(weekOffset);
          await fetchData(weekOffset, true);
          setActiveSessionBookingId(bookingId);
        }}
        onSlotTaken={() => {
          weekCache.current.delete(weekOffset);
          return fetchData(weekOffset, true);
        }}
      />
      <SessionDetailDrawer
        open={Boolean(activeSessionBooking)}
        onOpenChange={(open) => {
          if (!open) {
            setActiveSessionBookingId(null);
            setPendingSessionResources([]);
          }
        }}
        booking={activeSessionBooking}
        role="student"
        currentUserId={userObj.id}
        availableSlots={activeData.availableSlots || []}
        pendingResources={pendingSessionResources}
        onPendingResourcesChange={setPendingSessionResources}
        onSuccess={() => {
          weekCache.current.delete(weekOffset);
          return fetchData(weekOffset, true);
        }}
      />
      <AcademicScheduleDetailDialog
        schedule={selectedAcademicSchedule}
        open={Boolean(selectedAcademicSchedule)}
        onOpenChange={(open) => {
          if (!open) setSelectedAcademicSchedule(null);
        }}
      />
    </ApplicationPage>
  );
}
