import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import schedule from "@/messages/id/schedule.json";
import { getWeekScheduleDays } from "@/lib/date-utils";
import { ScheduleCalendarView } from "@/components/schedule/schedule-calendar-view";

const sessionDate = "2026-06-01";
const slots = [
  { id: "starting", sessionDate, startTime: "10:00", endTime: "11:30", tutor: { name: "Nara" } },
  { id: "released", sessionDate, startTime: "11:30", endTime: "13:00", tutor: { name: "Sinta" } },
];
const cancelled = {
  id: "past-booking", slotId: "released", status: "cancelled", sessionDate,
  startTime: "11:30", endTime: "13:00", course: { title: "Kalkulus" }, group: { name: "Kelompok A" },
};

const root = document.getElementById("root")!;
createRoot(root).render(
  <NextIntlClientProvider locale="id" messages={{ schedule }} timeZone="Asia/Jakarta">
    <ScheduleCalendarView
      role="student"
      currentUserId="student"
      weekInfo={getWeekScheduleDays(sessionDate)}
      isWeekLocked={false}
      weekOffset={0}
      onWeekChange={() => {}}
      coursesList={[]}
      slots={slots}
      bookings={[cancelled]}
      onSelectSlotToBook={(slot) => { root.dataset.selected = slot.id; }}
      onOpenSessionDetail={(booking) => { root.dataset.detail = booking.id; }}
    />
  </NextIntlClientProvider>,
);
