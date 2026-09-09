import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), "utf8");

describe("schedule calendar regression contracts", () => {
  test("client schedule surfaces only import browser-safe date helpers", () => {
    const student = source("app/(student)/dashboard/schedule/schedule-client.tsx");
    const admin = source("components/admin/academic-schedules-dashboard.tsx");
    const tutor = source("components/tutor/tutor-schedule-view.tsx");

    expect(student).not.toContain('from "@/lib/schedule-lock"');
    expect(admin).not.toContain('from "@/lib/schedule-lock"');
    expect(tutor).not.toContain('from "@/lib/schedule-lock"');

    expect(student).toContain("getWeekScheduleDays");
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
