import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import ui from "@/messages/id/ui.json";
import { ScheduleCalendarView } from "@/components/schedule/schedule-calendar-view";
import { getWeekScheduleDays } from "@/lib/date-utils";
import schedule from "@/messages/id/schedule.json";
import { GoogleCalendarControl } from "@/components/schedule/google-calendar-control";

createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider locale="id" messages={{ schedule, ui }} timeZone="Asia/Jakarta">
    <main className="mx-auto max-w-7xl p-4">
      <ScheduleCalendarView role="student" currentUserId="student" weekInfo={getWeekScheduleDays("2026-11-23")}
        isWeekLocked={false} weekOffset={0} onWeekChange={() => {}} coursesList={[]} slots={[]} bookings={[]}
        onSelectSlotToBook={() => {}}
        toolbarControls={<GoogleCalendarControl central={location.hash === "#central"} />} />
    </main>
  </NextIntlClientProvider>,
);
