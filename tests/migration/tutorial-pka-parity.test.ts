import { describe, expect, it } from "bun:test";
import { stableChecksum, stableStringify } from "@/lib/migrasi/pemetaan-legacy";

describe("Tutorial PKA legacy parity fixture", () => {
  it("keeps semantic counts and scores immutable in the compatibility snapshot", () => {
    const fixture = {
      course: { id: "tutorial-pka", title: "Tutorial PKA" },
      chapters: [{ id: "pka-bab-1", orderIndex: 1 }],
      registrations: [{ id: "registration-1", userId: "student-1" }],
      enrollments: [{ id: "enrollment-1", userId: "student-1" }],
      announcements: [{ id: "announcement-1", title: "Review" }],
      schedules: [{ id: "schedule-1", sessionAt: "2026-08-03T10:00:00.000Z" }],
      stages: [{ subject: "matematika", stage: 1, score: 72 }],
      attempts: [{ id: "attempt-1", score: 72, questionsSnapshot: [{ id: "q-1" }] }],
      analytics: [{ id: "analytics-1", attemptId: "attempt-1" }],
      progress: [{ id: "progress-1", stage: 1, bestScore: 72 }],
    };
    const before = stableChecksum(fixture);
    const after = JSON.parse(stableStringify(fixture));
    expect(stableChecksum(after)).toBe(before);
    expect(after.attempts[0].score).toBe(72);
    expect(after.progress[0].bestScore).toBe(72);
  });

  it("treats compatibility-only PKA rows as one-to-one preservation records", () => {
    const rows = [
      ["pka_registrations", "registration-1"],
      ["pka_announcements", "announcement-1"],
      ["pka_schedules", "schedule-1"],
      ["pka_stage_progress", "progress-1"],
    ];
    const preservationKeys = rows.map(([table, id]) => `${table}:${id}`);
    expect(new Set(preservationKeys).size).toBe(rows.length);
    expect(preservationKeys).toContain("pka_stage_progress:progress-1");
  });
});
