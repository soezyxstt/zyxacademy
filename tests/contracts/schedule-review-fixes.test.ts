import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("schedule PR review fixes", () => {
  test("tutor dashboard loads complete owned work and uses structured empty states", () => {
    const source = read("app/(tutor)/tutor/page.tsx");
    expect(source).not.toContain("fromDate: week.startIso");
    expect(source).not.toContain("toDate: week.endIso");
    expect(source).toContain("AdminEmptyState");
    expect(source).toContain('title="Belum ada sesi mendatang"');
    expect(source).toContain('title="Tidak ada tiket pending"');
  });

  test("academic date-only events remain visible outside the timed grid", () => {
    const source = read("components/schedule/schedule-calendar-view.tsx");
    expect(source).toContain("allDay?: boolean");
    expect(source).toContain("const allDay = start.minutes === 0 && !schedule.endDate");
    expect(source).toContain("Sepanjang hari");
    expect(source).toContain("!event.allDay && event.dateIso === dayIso");
  });

  test("Ops AI filters before limit and rolls back only through guarded admin scheduling", () => {
    const source = read("lib/admin-ops-ai/domain-schedules.ts");
    expect(source).toContain("conditions.push(inArray(bookings.slotId");
    expect(source).not.toContain("rows.filter((booking) => booking.slot?.tutorId");
    expect(source).toContain("executeAdminDeleteTutorAvailability");
    expect(source).not.toContain("rollbackCreatedAvailability");
    expect(source).not.toMatch(/\.delete\(tutorSlots\)/);

    const actions = read("app/(admin)/admin/(academic)/schedules/actions.ts");
    expect(actions).toContain("export async function executeAdminDeleteTutorAvailability");
    expect(actions).toContain("SLOT_ALREADY_BOOKED");
    expect(actions).toContain("admin.tutor_slot.delete_override");
  });

  test("date-only primitives are implemented only in lib/date-utils.ts", () => {
    const dateUtils = read("lib/date-utils.ts");
    const shim = read("lib/schedule/calendar-date.ts");
    expect(dateUtils).toContain("export function getCalendarWeekRange");
    expect(dateUtils).toContain("export function calendarDateToJakartaInstant");
    expect(shim).toContain('from "@/lib/date-utils"');
    expect(shim).not.toContain("CALENDAR_DATE_PATTERN");
  });

  test("student week failure is recoverable and current server week owns lock state", () => {
    const source = read("app/(student)/dashboard/schedule/schedule-client.tsx");
    expect(source).toContain("setLoadError");
    expect(source).toContain("Coba Lagi");
    expect(source).toContain("weekInfo={activeData.weekInfo}");
    expect(source).toContain("isWeekLocked={activeData.isWeekLocked}");
  });

  test("reviewed schedule files contain no prohibited en or em dash", () => {
    const files = [
      "app/(tutor)/tutor/page.tsx",
      "components/schedule/schedule-calendar-view.tsx",
      "lib/admin-ops-ai/domain-schedules.ts",
      "lib/date-utils.ts",
      "lib/schedule/calendar-date.ts",
    ];
    for (const file of files) {
      expect(read(file)).not.toMatch(/[\u2013\u2014]/);
    }
  });
});
