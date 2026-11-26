import type { getAdminScheduleData } from "@/app/(admin)/admin/(academic)/schedules/actions";
import { tutorialBookingRevision, tutorialSlotRevision, tutorQualificationRevision } from "@/lib/schedule/admin-tutorial-revisions";
import type { AdminTutorialSchedule } from "@/packages/academic/admin-tutorial-operations";

type Schedule = Awaited<ReturnType<typeof getAdminScheduleData>>;

/** Use the same Admin window, relationships and availability as the web schedule. */
export function tutorialOperationsView(schedule: Schedule, tutorOnly: boolean): AdminTutorialSchedule {
  const sorted = <T extends { label: string }>(items: T[]) => items.sort((a, b) => a.label.localeCompare(b.label, "id"));
  const bookedSlots = new Set(schedule.bookings.map(booking => booking.slotId));
  return {
    weekStart: schedule.weekRange.startIso,
    courses: sorted(schedule.courses.map(course => ({ id: course.id, label: course.title }))),
    tutors: sorted(schedule.tutors.map(tutor => {
      const courseIds = [...new Set(tutor.tutorCourses.map(course => course.courseId))];
      return { id: tutor.id, label: tutor.name, courseIds, revision: tutorQualificationRevision(tutor.id, courseIds) };
    })),
    groups: tutorOnly ? [] : sorted(schedule.groups.filter(group => group.status === "active").map(group => ({
      id: group.id, label: group.name, courseIds: group.courses.map(course => course.courseId),
    }))),
    slots: tutorOnly ? [] : schedule.slots.flatMap(slot => {
      const start = slot.startTime.slice(0, 5);
      const end = slot.endTime.slice(0, 5);
      if (!slot.sessionDate || !/^\d{4}-\d{2}-\d{2}$/.test(slot.sessionDate) ||
        !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(end)) return [];
      const booking = slot.booking;
      return [{
        id: slot.id, tutorId: slot.tutorId, tutorName: slot.tutor.name, date: slot.sessionDate, start, end,
        mode: slot.mode, location: slot.location, revision: tutorialSlotRevision(slot), deletable: !bookedSlots.has(slot.id) && !booking,
        booking: booking ? {
          id: booking.id, label: booking.group?.name ?? booking.course?.title ?? slot.tutor.name, courseId: booking.courseId,
          status: booking.status, revision: tutorialBookingRevision(booking),
        } : null,
      }];
    }).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)),
  };
}
