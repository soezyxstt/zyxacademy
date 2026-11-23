import { ApplicationPage } from "@/components/application-page";
import { ScheduleCalendarSkeleton } from "./schedule-client";

export default function StudentScheduleLoading() {
  return (
    <ApplicationPage spacing="space-y-(--related-gap)">
      <ScheduleCalendarSkeleton />
    </ApplicationPage>
  );
}
