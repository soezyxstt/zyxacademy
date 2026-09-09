"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { PageHeader } from "@/components/page-header";
import { ApplicationPage } from "@/components/application-page";
import { getScheduleData } from "./actions";
import { ScheduleCalendarView } from "@/components/schedule/schedule-calendar-view";
import { CollaborativeBookingModal } from "@/components/schedule/collaborative-booking-modal";
import {
  SessionDetailDrawer,
  type PendingSessionResource,
} from "@/components/schedule/session-detail-drawer";

function LoadingState() {
  return (
    <ApplicationPage>
      <PageHeader icon={CalendarDays} title="Kalender & Jadwal Tutorial" />
      <div className="p-16 text-center text-muted-foreground text-body-sm">
        Memuat data kalender dan slot tutorial...
      </div>
    </ApplicationPage>
  );
}

export function StudentScheduleClient() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [bookingSlotData, setBookingSlotData] = useState<{ slot: any; dateIso: string } | null>(null);
  const [activeSessionBookingId, setActiveSessionBookingId] = useState<string | null>(null);
  const [pendingSessionResources, setPendingSessionResources] = useState<PendingSessionResource[]>([]);
  const searchParams = useSearchParams();

  const fetchData = useCallback(async (offset: number) => {
    try {
      setLoading(true);
      setData(await getScheduleData(offset));
    } catch (error) {
      console.error("Gagal mengambil data jadwal:", error);
      toast.error("Gagal memuat kalender jadwal");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(weekOffset);
  }, [fetchData, weekOffset]);

  if (loading && !data) return <LoadingState />;

  const userObj = data?.user || {};
  const requestedCourseId = searchParams?.get("course") ?? undefined;
  const coursesList = (data?.enrollments || []).map((enrollment: any) => enrollment.course).filter(Boolean);
  const initialCourseFilter = requestedCourseId && coursesList.some((course: any) => course.id === requestedCourseId)
    ? requestedCourseId
    : "all";
  const tutorsList = (data?.availableSlots || []).map((slot: any) => slot.tutor).filter(Boolean);
  const sessionBookings = [...(data?.groupBookings || []), ...(data?.tutorBookings || [])];
  const activeSessionBooking = activeSessionBookingId
    ? sessionBookings.find((booking: any) => booking.id === activeSessionBookingId) || null
    : null;

  return (
    <ApplicationPage spacing="space-y-4">
      <PageHeader icon={CalendarDays} title="Kalender & Jadwal Tutorial" />

      <ScheduleCalendarView
        role="student"
        currentUserId={userObj.id}
        weekInfo={data.weekInfo}
        isWeekLocked={data.isWeekLocked}
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
      />

      <CollaborativeBookingModal
        open={Boolean(bookingSlotData)}
        onOpenChange={(open) => !open && setBookingSlotData(null)}
        selectedSlot={bookingSlotData?.slot}
        selectedDateIso={bookingSlotData?.dateIso || ""}
        groups={data.groups || []}
        onSuccess={async ({ bookingId, pendingResources }) => {
          setPendingSessionResources(pendingResources);
          await fetchData(weekOffset);
          setActiveSessionBookingId(bookingId);
        }}
        onSlotTaken={() => fetchData(weekOffset)}
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
        onSuccess={() => fetchData(weekOffset)}
      />
    </ApplicationPage>
  );
}
