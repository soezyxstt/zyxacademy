"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { toast } from "@/components/ui/toast";
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
import { daysFrom, getJakartaNow, getWeekScheduleDays } from "@/lib/date-utils";
import { isTutorialWeekLocked } from "@/lib/schedule/week-policy";

function LoadingState() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-brand-primary" />
    </div>
  );
}

export function StudentScheduleClient() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
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
      setLoading(false);
      return cached;
    }

    try {
      setLoading(true);
      const nextData = await getScheduleData(offset);
      weekCache.current.set(offset, nextData);
      if (requestId === activeRequest.current) {
        setData(nextData);
      }
      return nextData;
    } catch (error) {
      console.error("Gagal mengambil data jadwal:", error);
      if (requestId === activeRequest.current) {
        toast.error("Gagal memuat kalender jadwal");
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
    if (!data || loading) return;

    for (const adjacentOffset of [weekOffset - 1, weekOffset + 1]) {
      if (weekCache.current.has(adjacentOffset)) continue;
      void getScheduleData(adjacentOffset)
        .then((adjacentData) => {
          weekCache.current.set(adjacentOffset, adjacentData);
        })
        .catch(() => undefined);
    }
  }, [data, loading, weekOffset]);

  const displayWeekInfo = useMemo(
    () => getWeekScheduleDays(daysFrom(weekOffset * 7, getJakartaNow())),
    [weekOffset],
  );
  const displayWeekLocked = useMemo(
    () => isTutorialWeekLocked(displayWeekInfo.startOfWeekIso),
    [displayWeekInfo.startOfWeekIso],
  );

  if (loading && !data) return <LoadingState />;

  const userObj = data?.user || {};
  const coursesList = data?.courses || [];
  const tutorsList = data?.tutors || [];
  const initialCourseFilter = searchParams.get("course") || "all";
  const activeSessionBooking = activeSessionBookingId
    ? (data?.groupBookings || []).find((booking: any) => booking.id === activeSessionBookingId) || null
    : null;

  return (
    <ApplicationPage spacing="space-y-4">
      <PageHeader icon={CalendarDays} title="Kalender & Jadwal Tutorial" />

      <div className={calendarStyles.root} aria-busy={loading}>
        <ScheduleCalendarView
          role="student"
          currentUserId={userObj.id}
          weekInfo={displayWeekInfo}
          isWeekLocked={displayWeekLocked}
          weekOffset={weekOffset}
          onWeekChange={setWeekOffset}
          coursesList={coursesList}
          tutorsList={tutorsList}
          groupsList={data.groups || []}
          initialCourseFilter={initialCourseFilter}
          slots={data.availableSlots || []}
          bookings={data.groupBookings || []}
          academicSchedules={data.academicSchedules || []}
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
        groups={data.groups || []}
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
        availableSlots={data.availableSlots || []}
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
