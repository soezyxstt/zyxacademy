import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), "utf8");

describe("schedule calendar regression contracts", () => {
  test("student calendar consumes the server week identity while other client surfaces stay browser-safe", () => {
    const student = source("app/(student)/dashboard/schedule/schedule-client.tsx");
    const admin = source("components/admin/academic-schedules-dashboard.tsx");
    const tutor = source("components/tutor/tutor-schedule-view.tsx");

    expect(student).not.toContain('from "@/lib/schedule-lock"');
    expect(student).not.toContain("getWeekScheduleDays");
    expect(student).not.toContain("isTutorialWeekLocked");
    expect(student).toContain("weekInfo={activeData.weekInfo}");
    expect(student).toContain("isWeekLocked={activeData.isWeekLocked}");

    expect(admin).not.toContain('from "@/lib/schedule-lock"');
    expect(tutor).not.toContain('from "@/lib/schedule-lock"');
    expect(admin).toContain("getWeekScheduleDays");
    expect(tutor).toContain("getWeekScheduleDays");
  });

  test("admin schedule navigation is single-level and uses concise labels", () => {
    const admin = source("components/admin/academic-schedules-dashboard.tsx");

    expect(admin).toContain('value="calendar"');
    expect(admin).toContain("Daftar Jadwal");
    expect(admin).toContain("Ujian ITB");
    expect(admin).not.toContain("Jadwal Resmi");
    expect(admin).not.toContain("Ujian Resmi ITB");
    expect(admin).toContain('<SelectItem value="academic">Akademik</SelectItem>');
    expect(admin).toContain('<SelectItem value="tutorial">Tutorial</SelectItem>');
  });

  test("student booking modal contract matches its calendar caller and never trusts a client date", () => {
    const student = source("app/(student)/dashboard/schedule/schedule-client.tsx");
    const modal = source("components/schedule/collaborative-booking-modal.tsx");
    const bookingAction = source("app/(student)/dashboard/schedule/booking-actions.ts");

    expect(student).toContain('slot={bookingSlotData?.slot || null}');
    expect(student).toContain('dateIso={bookingSlotData?.dateIso || ""}');
    expect(modal).toContain("slot: any | null");
    expect(modal).toContain("dateIso: string");
    expect(modal).toContain("bookTutorialSlot");
    expect(bookingAction).toContain("tutorSlots.sessionDate");
    expect(bookingAction).not.toContain("targetDateIso");
  });

  test("calendar supports day/week/month, a range picker, 07:00-24:00, and vertical event composition", () => {
    const calendar = source("components/schedule/schedule-calendar-view.tsx");

    expect(calendar).toContain('type CalendarViewMode = "day" | "week" | "month"');
    expect(calendar).toContain("MonthPicker");
    expect(calendar).toContain("const START_HOUR = 7");
    expect(calendar).toContain("const END_HOUR = 24");
    expect(calendar).toContain("24:00");
    expect(calendar).toContain("break-words");
    expect(calendar).not.toContain("line-clamp");
    expect(calendar).not.toContain("Keterangan:");
    expect(calendar).toContain("Keterangan");
  });

  test("student calendar cards open detailed schedule and tutorial views", () => {
    const student = source("app/(student)/dashboard/schedule/schedule-client.tsx");

    expect(student).toContain("AcademicScheduleDetailDialog");
    expect(student).toContain("onOpenSessionDetail");
    expect(student).toContain("setActiveSessionBookingId");
    expect(student).toContain("setSelectedAcademicSchedule");
  });

  test("tutor slot dialog keeps date editable and persists optional notes", () => {
    const tutor = source("components/tutor/tutor-schedule-view.tsx");
    const actions = source("app/(tutor)/tutor/schedule/slot-note-actions.ts");

    expect(tutor).toContain('id="tutor-slot-date"');
    expect(tutor).toContain('type="date"');
    expect(tutor).not.toMatch(/id="tutor-slot-date"[\s\S]{0,250}readOnly/);
    expect(tutor).toContain("Catatan tutor");
    expect(tutor).toContain("addTutorSlotWithNotesAction");
    expect(actions).toContain("tutorSlotNotes");
    expect(actions).toContain("errorChainMessage");
    expect(actions).toContain(".cause");
  });

  test("Ops AI cannot bypass guarded scheduling creation and rolls back orphan availability", () => {
    const ops = source("lib/admin-ops-ai/domain-schedules.ts");

    expect(ops).toContain("executeAdminCreateTutorAvailability");
    expect(ops).toContain("executeAdminAssignTutorialSession");
    expect(ops).toContain("executeAdminMoveTutorialSession");
    expect(ops).toContain("executeAdminCancelTutorialSession");
    expect(ops).toContain("conditions.push(inArray(bookings.slotId");
    expect(ops).toContain("rollbackCreatedAvailability");
    expect(ops).not.toMatch(/\.insert\(tutorSlots\)/);
    expect(ops).not.toMatch(/\.insert\(bookings\)/);
    expect(ops).not.toMatch(/\.update\(bookings\)/);
  });

  test("every current group member can request a rename under one shared cooldown", () => {
    const action = source("app/(student)/dashboard/groups/rename-actions.ts");
    const panel = source("components/dashboard/student-group-rename-panel.tsx");

    expect(action).toContain("getMembership");
    expect(action).toContain("currentMembership");
    expect(action).not.toContain('membership.role !== "leader"');
    expect(action).toContain("Nama kelompok hanya dapat diganti satu kali setiap 30 hari.");
    expect(panel).toContain("Setiap anggota kelompok dapat mengubahnya.");
    expect(panel).toContain("groups.map");
  });
});
