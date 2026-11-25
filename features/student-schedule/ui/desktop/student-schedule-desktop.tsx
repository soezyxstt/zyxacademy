"use client";

import { ScheduleCalendarView } from "@/components/schedule/schedule-calendar-view";
import calendarStyles from "@/components/schedule/schedule-calendar-readability.module.css";
import type { StudentScheduleViewProps } from "@/features/student-schedule/model/schedule-events";

export function StudentScheduleDesktop({
  loading,
  allowPastBooking,
  currentUserId,
  weekInfo,
  isWeekLocked,
  weekOffset,
  onWeekChange,
  coursesList,
  tutorsList,
  groupsList,
  initialCourseFilter,
  compatibleCourseIds,
  slots,
  bookings,
  academicSchedules,
  toolbarControls,
  onSelectSlotToBook,
  onOpenSessionDetail,
  onEditSchedule,
}: StudentScheduleViewProps) {
  return (
    <div className={calendarStyles.root} aria-busy={loading}>
      <ScheduleCalendarView
        role="student"
        allowPastBooking={allowPastBooking}
        currentUserId={currentUserId}
        weekInfo={weekInfo}
        isWeekLocked={isWeekLocked}
        weekOffset={weekOffset}
        onWeekChange={onWeekChange}
        coursesList={coursesList}
        tutorsList={tutorsList}
        groupsList={groupsList}
        initialCourseFilter={initialCourseFilter}
        compatibleCourseIds={compatibleCourseIds}
        slots={slots}
        bookings={bookings}
        academicSchedules={academicSchedules}
        toolbarControls={toolbarControls}
        onSelectSlotToBook={onSelectSlotToBook}
        onOpenSessionDetail={onOpenSessionDetail}
        onEditSchedule={onEditSchedule}
      />
    </div>
  );
}
