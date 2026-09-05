"use client";

import { useState, useEffect, useCallback } from "react";
import { CalendarDays } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { PageHeader } from "@/components/page-header";
import { ApplicationPage } from "@/components/application-page";
import { getScheduleData } from "./actions";
import { ScheduleCalendarView } from "@/components/schedule/schedule-calendar-view";
import { CollaborativeBookingModal } from "@/components/schedule/collaborative-booking-modal";
import { PreSessionModal } from "@/components/schedule/pre-session-modal";
import { PostSessionModal } from "@/components/schedule/post-session-modal";
import { RescheduleTicketModal } from "@/components/schedule/reschedule-ticket-modal";
import { AuditLogDrawer } from "@/components/schedule/audit-log-drawer";
import { TutorAvailabilityPanel } from "@/components/schedule/tutor-availability-panel";

export default function SchedulePage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);

  // Active view tab for Tutor
  const [tutorActiveTab, setTutorActiveTab] = useState<"calendar" | "availability">("calendar");

  // Modal States
  const [bookingSlotData, setBookingSlotData] = useState<{ slot: any; dateIso: string } | null>(null);
  const [activePreSessionBooking, setActivePreSessionBooking] = useState<any | null>(null);
  const [activePostSessionBooking, setActivePostSessionBooking] = useState<any | null>(null);
  const [activeRescheduleBooking, setActiveRescheduleBooking] = useState<any | null>(null);
  const [activeAuditLogBooking, setActiveAuditLogBooking] = useState<any | null>(null);

  const fetchData = useCallback(async (offset = weekOffset) => {
    try {
      setLoading(true);
      const res = await getScheduleData(offset);
      setData(res);
    } catch (err: any) {
      console.error("Gagal mengambil data jadwal:", err);
      toast.error("Gagal memuat kalender jadwal");
    } finally {
      setLoading(false);
    }
  }, [weekOffset]);

  useEffect(() => {
    fetchData(weekOffset);
  }, [fetchData, weekOffset]);

  const handleWeekChange = (newOffset: number) => {
    setWeekOffset(newOffset);
  };

  if (loading && !data) {
    return (
      <ApplicationPage>
        <PageHeader
          icon={CalendarDays}
          title="Kalender & Jadwal Tutorial"
        />
        <div className="p-16 text-center text-muted-foreground text-body-sm">
          Memuat data kalender dan slot tutorial...
        </div>
      </ApplicationPage>
    );
  }

  const role = data?.role || "student";
  const userObj = data?.user || {};

  // Extract lists for filters
  const coursesList =
    role === "teacher"
      ? data.allCourses || []
      : (data.enrollments || []).map((e: any) => e.course).filter(Boolean);

  const tutorsList =
    role === "student"
      ? (data.availableSlots || []).map((s: any) => s.tutor).filter(Boolean)
      : [];

  const groupsList =
    role === "teacher"
      ? (data.tutorBookings || []).map((b: any) => b.group).filter(Boolean)
      : data.groups || [];

  return (
    <ApplicationPage spacing="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <PageHeader
          icon={CalendarDays}
          title="Kalender & Jadwal Tutorial"
        />

        {/* Tutor Tabs Switcher */}
        {role === "teacher" && (
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-card border border-border">
            <button
              type="button"
              onClick={() => setTutorActiveTab("calendar")}
              className={`px-3 py-1.5 rounded-lg text-body-xs font-semibold transition-all ${
                tutorActiveTab === "calendar"
                  ? "bg-brand-primary text-white shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Kalender Tutorial
            </button>
            <button
              type="button"
              onClick={() => setTutorActiveTab("availability")}
              className={`px-3 py-1.5 rounded-lg text-body-xs font-semibold transition-all ${
                tutorActiveTab === "availability"
                  ? "bg-brand-primary text-white shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Kelola Slot Ketersediaan
            </button>
          </div>
        )}
      </div>

      {/* Main Content */}
      {role === "teacher" && tutorActiveTab === "availability" ? (
        <TutorAvailabilityPanel
          mySlots={data.mySlots || []}
          certifiedCourses={data.certifiedCourses || []}
          onRefresh={() => fetchData(weekOffset)}
        />
      ) : (
        <ScheduleCalendarView
          role={role}
          currentUserId={userObj.id}
          weekInfo={data.weekInfo}
          isWeekLocked={data.isWeekLocked}
          weekOffset={weekOffset}
          onWeekChange={handleWeekChange}
          coursesList={coursesList}
          tutorsList={tutorsList}
          groupsList={groupsList}
          slots={role === "teacher" ? data.mySlots || [] : data.availableSlots || []}
          bookings={role === "teacher" ? data.tutorBookings || [] : data.groupBookings || []}
          academicSchedules={data.academicSchedules || []}
          onSelectSlotToBook={(slot, dateIso) => {
            setBookingSlotData({ slot, dateIso });
          }}
          onOpenPreSession={(booking) => {
            setActivePreSessionBooking(booking);
          }}
          onOpenPostSession={(booking) => {
            setActivePostSessionBooking(booking);
          }}
          onOpenRescheduleTicket={(booking) => {
            setActiveRescheduleBooking(booking);
          }}
          onOpenAuditLog={(booking) => {
            setActiveAuditLogBooking(booking);
          }}
        />
      )}

      {/* Collaborative Booking Modal */}
      <CollaborativeBookingModal
        open={Boolean(bookingSlotData)}
        onOpenChange={(open) => !open && setBookingSlotData(null)}
        selectedSlot={bookingSlotData?.slot}
        selectedDateIso={bookingSlotData?.dateIso || ""}
        groups={data?.groups || []}
        onSuccess={() => fetchData(weekOffset)}
      />

      {/* Pre-Session Modal */}
      <PreSessionModal
        open={Boolean(activePreSessionBooking)}
        onOpenChange={(open) => !open && setActivePreSessionBooking(null)}
        booking={activePreSessionBooking}
        onSuccess={() => fetchData(weekOffset)}
      />

      {/* Post-Session Modal */}
      <PostSessionModal
        open={Boolean(activePostSessionBooking)}
        onOpenChange={(open) => !open && setActivePostSessionBooking(null)}
        booking={activePostSessionBooking}
        onSuccess={() => fetchData(weekOffset)}
      />

      {/* Reschedule / Cancellation Ticket Modal */}
      <RescheduleTicketModal
        open={Boolean(activeRescheduleBooking)}
        onOpenChange={(open) => !open && setActiveRescheduleBooking(null)}
        booking={activeRescheduleBooking}
        role={role}
        currentUserId={userObj.id}
        availableSlots={data?.availableSlots || []}
        onSuccess={() => fetchData(weekOffset)}
      />

      {/* Audit Log Drawer */}
      <AuditLogDrawer
        open={Boolean(activeAuditLogBooking)}
        onOpenChange={(open) => !open && setActiveAuditLogBooking(null)}
        booking={activeAuditLogBooking}
      />
    </ApplicationPage>
  );
}
