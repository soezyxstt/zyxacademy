import {
  INDONESIAN_DAYS,
  type IndonesianDay,
  getWeekScheduleDays,
  parseDateInput,
} from "@/lib/date-utils";
import type {
  OwnedBookingItem,
  OwnedSlotItem,
  OwnedTicketItem,
  TutorScheduleReadModel,
} from "@/lib/schedule/tutor-read-model";

export type TutorWeekInfo = ReturnType<typeof getWeekScheduleDays>;
export type TutorWeekDayInfo = TutorWeekInfo["days"][number];

export function computeEndTime(startStr: string): string {
  if (!startStr) return "10:30";
  const [h, m] = startStr.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return "10:30";
  const totalMin = h * 60 + m + 90;
  const endH = Math.floor(totalMin / 60) % 24;
  const endM = totalMin % 60;
  return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
}

export function getIndonesianWeekdayFromDate(dateStr: string): IndonesianDay {
  if (!dateStr) return "Senin";
  const d = parseDateInput(dateStr);
  const dayIdx = d.getDay();
  return dayIdx === 0 ? "Minggu" : INDONESIAN_DAYS[dayIdx - 1];
}

export function formatWeekDate(dateStr: string, locale: "id" | "en"): string {
  const date = parseDateInput(dateStr);
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "id-ID", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

export function formatAgendaDateHeading(dateStr: string, locale: "id" | "en"): string {
  const date = parseDateInput(dateStr);
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(date);
}

export function formatShortWeekday(dateStr: string, locale: "id" | "en"): string {
  const date = parseDateInput(dateStr);
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "id-ID", {
    weekday: "short",
    timeZone: "UTC",
  }).format(date);
}

export function formatDayNumber(dateStr: string): string {
  const parts = dateStr.split("-");
  return parts[2] ? String(Number(parts[2])) : "";
}

export const TUTOR_SLOT_TIME_PRESETS = ["08:00", "09:30", "13:00", "15:00", "16:30", "19:00"] as const;

export interface TutorScheduleSurfaceProps {
  initialData: TutorScheduleReadModel;
  scheduleData: TutorScheduleReadModel;
  currentUserId: string;
  locale: "id" | "en";
  isPending: boolean;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  weekOffset: number;
  weekInfo: TutorWeekInfo;
  isWeekLocked: boolean;
  handleWeekChange: (offset: number) => void;
  selectedDate: string;
  setSelectedDate: (dateIso: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedDayFilter: string;
  setSelectedDayFilter: (day: string) => void;
  selectedCourseFilter: string;
  setSelectedCourseFilter: (courseId: string) => void;
  selectedGroupFilter: string;
  setSelectedGroupFilter: (groupId: string) => void;
  filteredSlots: OwnedSlotItem[];
  filteredBookings: OwnedBookingItem[];
  filteredTickets: OwnedTicketItem[];
  slotNotes: Record<string, string>;
  slotsWithHistory: Set<string>;
  openedSlotCount: number;
  filledSlotCount: number;
  availableSlotCount: number;
  // Create / Edit slot draft
  isAddSlotOpen: boolean;
  setIsAddSlotOpen: (open: boolean) => void;
  editingSlotId: string | null;
  newSlotDate: string;
  setNewSlotDate: (date: string) => void;
  derivedWeekday: IndonesianDay;
  newSlotStart: string;
  handleStartTimeChange: (val: string) => void;
  newSlotEnd: string;
  newSlotMode: "online" | "offline";
  setNewSlotMode: (mode: "online" | "offline") => void;
  newSlotLocation: string;
  setNewSlotLocation: (loc: string) => void;
  newSlotNotes: string;
  setNewSlotNotes: (notes: string) => void;
  repeatWeeks: number;
  setRepeatWeeks: (weeks: number) => void;
  canSaveSlot: boolean;
  handleSaveSlot: () => void;
  openAddSlotDialog: () => void;
  openEditSlotDialog: (slot: OwnedSlotItem) => void;
  handleCreateSlotDirect: (dateIso: string, startTimeStr?: string) => void;
  // Actions
  requestDeleteSlot: (slotId: string) => void;
  handleOpenMoveModal: (booking: OwnedBookingItem) => void;
  openDecideTicket: (ticket: OwnedTicketItem, defaultDecision?: "approved" | "rejected") => void;
  openThreadId: string | null;
  setOpenThreadId: (id: string | null) => void;
  replyText: string;
  setReplyText: (text: string) => void;
  handleReplyTicket: () => void;
  onOpenSessionDetail: (bookingId: string) => void;
  handleCopyPreviousWeek: () => void;
}
