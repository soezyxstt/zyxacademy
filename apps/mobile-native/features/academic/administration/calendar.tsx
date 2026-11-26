import { useContext, useState } from "react";
import { Calendar, type CalendarDay, type CalendarEvent } from "../../shared-ui";
import { CourseTheme } from "../courses/ui";
import { dateLabel, splitDateTime } from "./ui";

const jakartaWeekday = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "short" });
const millisPerDay = 24 * 60 * 60 * 1000;

export function AdministrationCalendar({ start, today, events, dayOffset, onPeriodChange, onEventPress }: {
  start: string; today: string; events: readonly CalendarEvent[]; dayOffset: number;
  onPeriodChange(direction: -1 | 1): void; onEventPress(id: string): void;
}) {
  const theme = useContext(CourseTheme);
  const [date, setDate] = useState("");
  const startTime = Date.parse(`${start}T00:00:00+07:00`);
  const days: CalendarDay[] = Array.from({ length: 7 }, (_, index) => {
    const instant = new Date(startTime + index * millisPerDay);
    const id = splitDateTime(instant.toISOString()).date;
    return { id, label: dateLabel(instant.toISOString()), weekday: jakartaWeekday.format(instant), day: String(Number(id.slice(-2))), today: today === id };
  });
  const selected = days.find((day) => day.id === date) ?? days.find((day) => day.today)
    ?? days.find((day) => events.some((event) => event.dateId === day.id)) ?? days[0];
  return <Calendar periodLabel={`${days[0].label} sampai ${days[6].label}`} days={days} events={events}
    selectedDateId={selected.id} onDateChange={setDate} onPeriodChange={onPeriodChange} onEventPress={onEventPress}
    previousDisabled={dayOffset <= -520} nextDisabled={dayOffset >= 520} theme={theme} testID="academic-admin-calendar"
    labels={{ previous: "Minggu sebelumnya", next: "Minggu berikutnya", today: "Hari ini", empty: "Tidak ada jadwal pada tanggal ini.",
      getEventCountLabel: (count) => `${count} jadwal` }} />;
}
