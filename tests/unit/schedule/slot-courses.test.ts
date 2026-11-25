import { describe, expect, test } from "bun:test";
import {
  filterCourseIdsBySlotRestriction,
  isCourseAllowedForSlot,
  isMissingTutorSlotCoursesTable,
  normalizeSlotCourseIds,
  toggleSlotCourseSelection,
} from "@/lib/schedule/slot-courses";

describe("slot-courses helpers", () => {
  test("normalizeSlotCourseIds trims and deduplicates case-insensitively", () => {
    expect(normalizeSlotCourseIds(null)).toEqual([]);
    expect(normalizeSlotCourseIds([" ma1101 ", "MA1101", "", "fi1101"])).toEqual(["ma1101", "fi1101"]);
  });

  test("toggleSlotCourseSelection normalizes all-selected or empty back to all courses ([])", () => {
    const all = ["ma1101", "fi1101"];
    expect(toggleSlotCourseSelection([], "ma1101", all)).toEqual(["ma1101"]);
    expect(toggleSlotCourseSelection(["ma1101"], "fi1101", all)).toEqual([]);
    expect(toggleSlotCourseSelection(["ma1101"], "ma1101", all)).toEqual([]);
  });

  test("filterCourseIdsBySlotRestriction leaves unrestricted slots open and intersects restricted slots with alias expansion", () => {
    const tutorCourses = ["canonical-math", "ma1101", "canonical-phys", "fi1101"];
    expect(filterCourseIdsBySlotRestriction(tutorCourses, [])).toEqual(tutorCourses);

    const expand = (id: string) =>
      id === "canonical-math" || id === "ma1101" ? ["canonical-math", "ma1101"] : [id];

    expect(filterCourseIdsBySlotRestriction(tutorCourses, ["canonical-math"], expand)).toEqual([
      "canonical-math",
      "ma1101",
    ]);
    expect(filterCourseIdsBySlotRestriction(tutorCourses, ["MA1101"], expand)).toEqual([
      "canonical-math",
      "ma1101",
    ]);
    expect(filterCourseIdsBySlotRestriction(tutorCourses, ["ki1101"], expand)).toEqual([]);
  });

  test("isCourseAllowedForSlot permits all courses when unrestricted and enforces subset when restricted", () => {
    expect(isCourseAllowedForSlot(["ma1101"], [])).toBe(true);
    expect(isCourseAllowedForSlot(["ma1101", "canonical-math"], ["canonical-math"])).toBe(true);
    expect(isCourseAllowedForSlot(["MA1101"], ["ma1101"])).toBe(true);
    expect(isCourseAllowedForSlot(["fi1101"], ["ma1101"])).toBe(false);
  });

  test("isMissingTutorSlotCoursesTable detects missing Postgres or SQLite relation errors", () => {
    expect(isMissingTutorSlotCoursesTable(new Error('relation "tutor_slot_courses" does not exist'))).toBe(true);
    expect(isMissingTutorSlotCoursesTable(new Error("no such table: tutor_slot_courses"))).toBe(true);
    expect(isMissingTutorSlotCoursesTable(new Error("connection timeout"))).toBe(false);
  });
});
