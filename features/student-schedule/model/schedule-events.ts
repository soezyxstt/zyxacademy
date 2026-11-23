import type { ReactNode } from "react";
import { matchesScheduleCourse } from "@/lib/schedule/course-filter";
import { canBookTutorialSlot } from "@/lib/schedule/week-policy";
import { parseCalendarDate, type CalendarDate } from "@/lib/schedule/calendar-date";

export type StudentScheduleDay = {
  dateIso: string;
  dayName: string;
  dayOfMonth: number;
  monthName: string;
  isToday: boolean;
  isPast: boolean;
};

export type StudentScheduleWeekInfo = {
  startOfWeekIso: string;
  endOfWeekIso: string;
  mondayDate: Date;
  days: StudentScheduleDay[];
};

export type StudentScheduleViewProps = {
  loading: boolean;
  allowPastBooking: boolean;
  currentUserId: string;
  weekInfo: StudentScheduleWeekInfo;
  isWeekLocked: boolean;
  weekOffset: number;
  onWeekChange: (offset: number) => void;
  coursesList: Array<{ id: string; title: string }>;
  tutorsList: Array<{ id: string; name: string }>;
  groupsList: Array<{ id: string; name: string }>;
  initialCourseFilter: string;
  compatibleCourseIds: readonly string[];
  slots: any[];
  bookings: any[];
  academicSchedules: any[];
  toolbarControls?: ReactNode;
  onSelectSlotToBook: (slot: any, dateIso: string) => void;
  onOpenSessionDetail: (booking: any) => void;
  onEditSchedule: (schedule: any) => void;
};

export type StudentAgendaEventKind = "availability" | "booking" | "academic";

export type StudentAgendaEvent = {
  id: string;
  kind: StudentAgendaEventKind;
  dateIso: CalendarDate;
  startMinutes: number;
  endMinutes: number;
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  mode?: "online" | "offline" | string | null;
  location?: string | null;
  courseId?: string | null;
  tutorId?: string | null;
  locked: boolean;
  allDay: boolean;
  source: any;
};

const START_MINUTES = 7 * 60;
const END_MINUTES = 24 * 60;

export function timeToMinutes(value?: string | null): number {
  if (!value || !/^\d{1,2}:\d{2}$/.test(value)) return START_MINUTES;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function minutesToTime(value: number): string {
  const bounded = Math.max(0, Math.min(24 * 60, value));
  const hour = Math.floor(bounded / 60);
  const minute = bounded % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function formatScheduleDateLabel(
  dateIso: CalendarDate,
  options: Intl.DateTimeFormatOptions,
  locale: "id" | "en" = "id"
): string {
  const { year, month, day } = parseCalendarDate(dateIso);
  return new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-US", {
    ...options,
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0)));
}

function parseAcademicInstant(
  value: unknown
): { dateIso: CalendarDate; minutes: number } | null {
  if (!value) return null;
  const date = new Date(value as string | number | Date);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const dateIso = `${values.year}-${values.month}-${values.day}` as CalendarDate;
  return {
    dateIso,
    minutes: Number(values.hour) * 60 + Number(values.minute),
  };
}

export function normalizeStudentScheduleEvents(params: {
  slots: any[];
  bookings: any[];
  academicSchedules: any[];
  allowPastBooking: boolean;
  now: Date;
  labels: {
    tutorFallback: string;
    tutorLabel: string;
    cancelled: string;
    sessionTitle: string;
    academicTypeLabel: (type: string) => string;
  };
}): StudentAgendaEvent[] {
  const { slots, bookings, academicSchedules, allowPastBooking, now, labels } = params;
  const result: StudentAgendaEvent[] = [];
  const bookingSlotIds = new Set(
    bookings.filter((booking) => booking.status !== "cancelled").map((booking) => booking.slotId)
  );

  for (const slot of slots) {
    const dateIso = slot.sessionDate as CalendarDate | null | undefined;
    if (!dateIso || bookingSlotIds.has(slot.id) || slot.booking) continue;
    const startMinutes = timeToMinutes(slot.startTime);
    const endMinutes = Math.max(startMinutes + 30, timeToMinutes(slot.endTime));
    const tutorName = slot.tutor?.name || labels.tutorFallback;
    result.push({
      id: `slot-${slot.id}`,
      kind: "availability",
      dateIso,
      startMinutes,
      endMinutes,
      title: `${minutesToTime(startMinutes)} - ${minutesToTime(endMinutes)}`,
      subtitle: `${labels.tutorLabel}: ${tutorName}`,
      meta: slot.notes || null,
      mode: slot.mode,
      location: slot.location,
      tutorId: slot.tutorId || slot.tutor?.id || null,
      locked: !allowPastBooking && !canBookTutorialSlot(dateIso, slot.startTime, now),
      allDay: false,
      source: slot,
    });
  }

  for (const booking of bookings) {
    const dateIso = booking.sessionDate as CalendarDate | null | undefined;
    if (!dateIso) continue;
    const startMinutes = timeToMinutes(booking.startTime || booking.slot?.startTime);
    const endMinutes = Math.max(
      startMinutes + 30,
      timeToMinutes(booking.endTime || booking.slot?.endTime)
    );
    const groupName = booking.group?.name || booking.groupName;
    const tutorName = booking.slot?.tutor?.name || booking.tutor?.name;
    const subtitle =
      [
        booking.status === "cancelled" ? labels.cancelled : null,
        groupName,
        tutorName ? `${labels.tutorLabel}: ${tutorName}` : null,
      ]
        .filter(Boolean)
        .join(", ") || null;

    result.push({
      id: `booking-${booking.id}`,
      kind: "booking",
      dateIso,
      startMinutes,
      endMinutes,
      title: booking.course?.title || booking.courseTitle || booking.topic || labels.sessionTitle,
      subtitle,
      meta: booking.topic || booking.preSessionNotes || null,
      mode: booking.mode || booking.slot?.mode,
      location: booking.location || booking.slot?.location,
      courseId: booking.courseId || booking.course?.id || null,
      tutorId: booking.slot?.tutorId || booking.tutorId || booking.slot?.tutor?.id || null,
      locked: false,
      allDay: false,
      source: booking,
    });
  }

  for (const schedule of academicSchedules) {
    const start = parseAcademicInstant(schedule.startDate);
    if (!start) continue;
    const end = parseAcademicInstant(schedule.endDate);
    const allDay = start.minutes === 0 && !schedule.endDate;
    const sameDayEnd = end && end.dateIso === start.dateIso ? end.minutes : null;
    const endMinutes = allDay
      ? END_MINUTES
      : sameDayEnd && sameDayEnd > start.minutes
        ? sameDayEnd
        : start.minutes + 90;
    const typeKey =
      schedule.type === "official_exam" || schedule.type === "tryout" || schedule.type === "quiz"
        ? schedule.type
        : "general";

    result.push({
      id: `academic-${schedule.id}`,
      kind: "academic",
      dateIso: start.dateIso,
      startMinutes: start.minutes,
      endMinutes,
      title: schedule.title || labels.academicTypeLabel(typeKey),
      subtitle: schedule.course?.title || schedule.courseTitle || labels.academicTypeLabel(typeKey),
      meta: schedule.description || null,
      location: schedule.location,
      courseId: schedule.courseId || schedule.course?.id || null,
      locked: false,
      allDay,
      source: schedule,
    });
  }

  return result.sort(
    (a, b) => a.dateIso.localeCompare(b.dateIso) || a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes
  );
}

export function filterStudentScheduleEvents(params: {
  events: StudentAgendaEvent[];
  courseFilter: string;
  tutorFilter: string;
  compatibleCourseIds: readonly string[];
}): StudentAgendaEvent[] {
  const { events, courseFilter, tutorFilter, compatibleCourseIds } = params;
  return events.filter((event) => {
    if (courseFilter !== "all") {
      if (event.kind === "availability") {
        const tutorCourses = event.source?.tutor?.tutorCourses || [];
        const hasCourse = event.source?.matchedCourseIds
          ? event.source.matchedCourseIds.some((id: string) =>
              matchesScheduleCourse(id, courseFilter, compatibleCourseIds)
            )
          : tutorCourses.some((entry: any) =>
              matchesScheduleCourse(entry.courseId || entry.course?.id, courseFilter, compatibleCourseIds)
            );
        if (!hasCourse) return false;
      } else if (!matchesScheduleCourse(event.courseId, courseFilter, compatibleCourseIds)) {
        return false;
      }
    }
    if (tutorFilter !== "all" && event.kind !== "academic" && event.tutorId !== tutorFilter) {
      return false;
    }
    return true;
  });
}
