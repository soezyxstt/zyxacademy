import { addTutorDays } from "../../../../../packages/native-parity/academic/tutor/fixture-interactions";
import { Calendar, type CalendarEvent } from "../../shared-ui";
import type { TutorTheme } from "./ui";

const shortDate = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "UTC" });
const fullDate = new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeZone: "UTC" });
const weekday = new Intl.DateTimeFormat("id-ID", { weekday: "short", timeZone: "UTC" });
const jakartaDate = new Intl.DateTimeFormat("en", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Jakarta" });

const labels = {
  previous: "Pekan lalu",
  next: "Pekan depan",
  today: "Hari ini",
  empty: "Tidak ada slot atau sesi pada tanggal ini.",
  getEventCountLabel: (count: number) => `${count} agenda`,
};

export function tutorJakartaToday() {
  const parts = jakartaDate.formatToParts(new Date());
  return ["year", "month", "day"].map((type) => parts.find((part) => part.type === type)?.value).join("-");
}

export function TutorWeekCalendar({
  theme, start, week, today, selectedDate, events, onWeekChange, onDateChange, onEventPress,
}: {
  theme: TutorTheme;
  start: string;
  week: number;
  today: string;
  selectedDate: string;
  events: readonly CalendarEvent[];
  onWeekChange: (direction: -1 | 1) => void;
  onDateChange: (date: string) => void;
  onEventPress?: (id: string) => void;
}) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const id = addTutorDays(start, index);
    const date = new Date(id);
    return { id, weekday: weekday.format(date), day: String(date.getUTCDate()), label: fullDate.format(date), today: id === today };
  });
  const end = days[6].id;
  return <Calendar
    theme={theme}
    periodLabel={`${shortDate.format(new Date(start))} sampai ${shortDate.format(new Date(end))}`}
    days={days}
    events={events}
    selectedDateId={selectedDate}
    onDateChange={onDateChange}
    onPeriodChange={onWeekChange}
    onEventPress={onEventPress}
    previousDisabled={week <= -520}
    nextDisabled={week >= 520}
    labels={labels}
    testID="tutor-schedule-calendar"
  />;
}
