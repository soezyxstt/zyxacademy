import { expect, test } from "bun:test";
import { demoCommunitySchedule } from "./community-schedule";
import { communityKey, demoWeek, emptyCommunity, parseCommunity } from "./community-state";
import { scopeStudentSchedule } from "@/lib/schedule/student-schedule-scope";

const scopes = ["ma1101", "fi1101", "ki1101", "wi1102"].map(courseId => ({ courseId, revision: "r1" }));
const courses = scopes.map(scope => ({ id: scope.courseId, title: scope.courseId }));
test("global calendar combines distinct weekly seeds while course calendars stay scoped", () => {
  for (const anchor of ["2026-11-16", "2028-02-29", "2035-12-31"]) {
    const global = demoCommunitySchedule(scopes, courses, anchor, () => null);
    expect(global.groupBookings).toHaveLength(8);
    expect(global.availableSlots).toHaveLength(12);
    expect(new Set(global.groupBookings.map(row => row.id)).size).toBe(8);
    expect(new Set(global.availableSlots.map(row => row.id)).size).toBe(12);
    expect(new Set(global.groups.map(row => row.name)).size).toBe(4);
    expect(new Set(global.groupBookings.map(row => row.topic)).size).toBe(8);
    expect(new Set(global.availableSlots.map(row => row.tutor.name)).size).toBe(4);
    for (const scope of scopes) {
      const selected = scopeStudentSchedule(global, [scope.courseId]);
      expect(selected.groupBookings).toHaveLength(2);
      expect(selected.availableSlots).toHaveLength(3);
      expect(selected.groups).toHaveLength(1);
      expect(selected.groupBookings.every(row => row.courseId === scope.courseId)).toBe(true);
    }
  }
});
test("legacy seed overrides preserve moved dates, notes and attachments without duplicate replacement seeds", () => {
  const scope = scopes[1];
  const seed = demoWeek(scope, "2026-11-16", emptyCommunity(scope.courseId)).bookings[0];
  const resources = [{ id: "unchanged-file-id", phase: "pre" as const, kind: "file" as const, label: "notes.pdf", url: "", fileName: "notes.pdf", mimeType: "application/pdf", sizeBytes: 4, createdById: "fictional-demo-student" }];
  const saved = JSON.stringify({ ...emptyCommunity(scope.courseId), group: { name: "Custom group", members: ["Alya"] }, bookings: [{ ...seed, id: "demo-booking-2026-11-16", groupId: "demo-group", sessionDate: "2026-11-19", startTime: "10:00", endTime: "11:30", preSessionNotes: "Keep this", resources }] });
  const parsed = parseCommunity(saved, scope.courseId);
  expect(parsed.bookings[0].id).toBe(seed.id);
  expect(parsed.bookings[0].sessionDate).toBe("2026-11-19");
  expect(parsed.bookings[0].resources).toEqual(resources);
  const calendar = demoCommunitySchedule(scopes, courses, "2026-11-16", key => key === communityKey(scope) ? saved : null);
  const own = calendar.groupBookings.filter(row => row.courseId === scope.courseId);
  expect(own).toHaveLength(2);
  expect(own.find(row => row.id === seed.id)?.preSessionNotes).toBe("Keep this");
  expect(own[0].group.name).toBe("Custom group");
  expect(calendar.groupBookings.filter(row => row.courseId === scopes[0].courseId)).toHaveLength(2);
});

test("opaque production course IDs still select the authored subject profiles by title", () => {
  const titles = ["Matematika I", "Fisika Dasar I", "Kimia Dasar I", "Berpikir Komputasional"];
  const opaque = titles.map((title, i) => ({ id: `00000000-0000-4000-8000-00000000000${i}`, title }));
  const calendar = demoCommunitySchedule(opaque.map(course => ({ courseId: course.id, revision: "r1" })), opaque, "2026-11-16", () => null);
  expect(calendar.groups.map(group => group.name)).toEqual(["Kalkulus bersama", "Tim Newton", "Ikatan belajar", "Logika runtut"]);
  expect(new Set(calendar.availableSlots.map(slot => slot.tutor.name)).size).toBe(4);
  expect(() => parseCommunity(JSON.stringify({ ...emptyCommunity(), bookings: [calendar.groupBookings[0]] }), opaque[1].id, opaque[1].title)).toThrow("COURSE_UNAVAILABLE");
});
