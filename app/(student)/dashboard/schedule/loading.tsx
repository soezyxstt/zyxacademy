import { ApplicationPage } from "@/components/application-page";
import { ScheduleCalendarSkeleton } from "./schedule-client";

export default function StudentScheduleLoading() {
  return (
    <ApplicationPage role="status" aria-label="Memuat" spacing="space-y-(--related-gap)">
      <ScheduleCalendarSkeleton />
    </ApplicationPage>
  );
}
