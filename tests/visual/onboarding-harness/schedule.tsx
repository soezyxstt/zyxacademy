import { useState } from "react";
import { TutorScheduleDesktop } from "@/features/tutor-schedule/ui/desktop/tutor-schedule-desktop";
import { TutorScheduleMobile } from "@/features/tutor-schedule/ui/mobile/tutor-schedule-mobile";
import { StudentScheduleMobile } from "@/features/student-schedule/ui/mobile/student-schedule-mobile";
import { ScheduleCalendarView } from "@/components/schedule/schedule-calendar-view";
import { useViewportMode } from "@/hooks/use-viewport-mode";
import { getWeekScheduleDays } from "@/lib/date-utils";
import { addCalendarDays } from "@/lib/schedule/calendar-date";
import type { TutorScheduleReadModel } from "@/lib/schedule/tutor-read-model";
import type { TutorScheduleSurfaceProps } from "@/features/tutor-schedule/model/types";
import { fixture, fixtureCourse, fixtureSession } from "./config";

const noop = () => {};
const emptySchedule: TutorScheduleReadModel = {
  tutor: { ...fixtureSession.user, status: "active" },
  assignedActiveCourses: fixture.hasCourse ? [fixtureCourse] : [],
  eligibleGroups: [], ownedSlots: [], ownedBookings: [], ownedTickets: [], ownedSchedules: [],
  compatibilitySource: "canonical",
};

export function FixtureSchedule() {
  const mobile = useViewportMode() === "mobile";
  const [activeTab, setActiveTab] = useState("calendar");
  const [weekOffset, setWeekOffset] = useState(0);
  const [isAddSlotOpen, setIsAddSlotOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState("2026-11-25");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDayFilter, setSelectedDayFilter] = useState("all");
  const [selectedCourseFilter, setSelectedCourseFilter] = useState("all");
  const [selectedGroupFilter, setSelectedGroupFilter] = useState("all");
  const [newSlotDate, setNewSlotDate] = useState("2026-11-25");
  const [newSlotStart, handleStartTimeChange] = useState("09:30");
  const [newSlotMode, setNewSlotMode] = useState<"online" | "offline">("online");
  const [newSlotLocation, setNewSlotLocation] = useState("");
  const [newSlotNotes, setNewSlotNotes] = useState("");
  const [repeatWeeks, setRepeatWeeks] = useState(1);
  const weekInfo = getWeekScheduleDays(addCalendarDays("2026-11-25", weekOffset * 7));

  if (fixture.role === "student") {
    const props = {
      loading: false, allowPastBooking: false, currentUserId: fixture.userId,
      weekInfo, isWeekLocked: false, weekOffset, onWeekChange: setWeekOffset,
      coursesList: fixture.hasCourse ? [fixtureCourse] : [], tutorsList: [], groupsList: [],
      initialCourseFilter: "all", compatibleCourseIds: [], slots: [], bookings: [], academicSchedules: [],
      onSelectSlotToBook: noop, onOpenSessionDetail: noop, onEditSchedule: noop,
    };
    return mobile ? <StudentScheduleMobile {...props} /> : <ScheduleCalendarView role="student" {...props} />;
  }

  const props: TutorScheduleSurfaceProps = {
    initialData: emptySchedule, scheduleData: emptySchedule, currentUserId: fixture.userId, locale: fixture.locale,
    isPending: false, activeTab, setActiveTab, weekOffset, weekInfo, isWeekLocked: false,
    handleWeekChange: setWeekOffset, selectedDate, setSelectedDate, searchQuery, setSearchQuery,
    selectedDayFilter, setSelectedDayFilter, selectedCourseFilter, setSelectedCourseFilter,
    selectedGroupFilter, setSelectedGroupFilter, filteredSlots: [], filteredBookings: [], filteredTickets: [],
    slotNotes: {}, slotCourses: {}, slotsWithHistory: new Set(), openedSlotCount: 0, filledSlotCount: 0, availableSlotCount: 0,
    isAddSlotOpen, setIsAddSlotOpen, editingSlotId: null, newSlotDate, setNewSlotDate, derivedWeekday: "Rabu",
    newSlotStart, handleStartTimeChange, newSlotEnd: "11:00", newSlotMode, setNewSlotMode,
    newSlotLocation, setNewSlotLocation, newSlotNotes, setNewSlotNotes,
    newSlotCourseIds: fixture.hasCourse ? [fixture.courseId] : [], onToggleSlotCourse: noop,
    onSelectAllSlotCourses: noop, repeatWeeks, setRepeatWeeks, canSaveSlot: false,
    handleSaveSlot: () => { throw new Error("The onboarding fixture must never save a slot"); },
    openAddSlotDialog: () => setIsAddSlotOpen(true), openEditSlotDialog: noop,
    handleCreateSlotDirect: noop, requestDeleteSlot: noop, handleOpenMoveModal: noop,
    openDecideTicket: noop, openThreadId: null, setOpenThreadId: noop, replyText: "", setReplyText: noop,
    handleReplyTicket: noop, onOpenSessionDetail: noop, handleCopyPreviousWeek: noop,
  };
  return mobile ? <TutorScheduleMobile {...props} /> : <TutorScheduleDesktop {...props} />;
}
