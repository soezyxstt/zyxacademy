import { describe, expect, test } from "bun:test";
import {
  getEligibleCoursesForGroupAndSlot,
  getGroupQuotaSummary,
  pickDefaultGroupId,
  resolveBookingSlotDurationMinutes,
} from "@/lib/schedule/booking-modal-helpers";

describe("booking-modal-helpers", () => {
  test("computes slot duration from HH:MM and falls back to 90 minutes", () => {
    expect(resolveBookingSlotDurationMinutes("16:30", "18:00")).toBe(90);
    expect(resolveBookingSlotDurationMinutes("09:00", "10:00")).toBe(60);
    expect(resolveBookingSlotDurationMinutes("18:00", "16:30")).toBe(90);
    expect(resolveBookingSlotDurationMinutes(null, "18:00")).toBe(90);
    expect(resolveBookingSlotDurationMinutes("invalid", "18:00")).toBe(90);
  });

  test("evaluates group quota and active status accurately", () => {
    expect(getGroupQuotaSummary(null)).toEqual({
      total: 0,
      used: 0,
      remaining: 0,
      isZeroQuota: true,
      isExhausted: true,
      isInactive: false,
      canBook: false,
    });

    expect(
      getGroupQuotaSummary({
        id: "g1",
        status: "active",
        totalQuotaSessions: 15,
        usedQuotaSessions: 4,
      }),
    ).toEqual({
      total: 15,
      used: 4,
      remaining: 11,
      isZeroQuota: false,
      isExhausted: false,
      isInactive: false,
      canBook: true,
    });

    expect(
      getGroupQuotaSummary({
        id: "g-self-study",
        status: "active",
        totalQuotaSessions: 0,
        usedQuotaSessions: 0,
      }),
    ).toMatchObject({ isZeroQuota: true, isExhausted: false, canBook: false });

    expect(
      getGroupQuotaSummary({
        id: "g-exhausted",
        status: "active",
        totalQuotaSessions: 15,
        usedQuotaSessions: 15,
      }),
    ).toMatchObject({ remaining: 0, isZeroQuota: false, isExhausted: true, canBook: false });

    expect(
      getGroupQuotaSummary({
        id: "g-inactive",
        status: "archived",
        totalQuotaSessions: 15,
        usedQuotaSessions: 0,
      }),
    ).toMatchObject({ isInactive: true, canBook: false });
  });

  test("intersects group courses with slot matchedCourseIds", () => {
    const group = {
      id: "g1",
      courses: [
        { courseId: "calc", course: { id: "calc", title: "Kalkulus IA" } },
        { courseId: "phys", course: { id: "phys", title: "Fisika Dasar IA" } },
        { courseId: "calc", course: { id: "calc", title: "Kalkulus IA" } },
      ],
    };

    const matched = getEligibleCoursesForGroupAndSlot(group, {
      id: "slot-1",
      matchedCourseIds: ["calc", "canonical-calc"],
    });
    expect(matched.linkedCourses).toEqual([
      { id: "calc", title: "Kalkulus IA" },
      { id: "phys", title: "Fisika Dasar IA" },
    ]);
    expect(matched.eligibleCourses).toEqual([{ id: "calc", title: "Kalkulus IA" }]);

    const noneMatched = getEligibleCoursesForGroupAndSlot(group, {
      id: "slot-2",
      matchedCourseIds: ["chem"],
    });
    expect(noneMatched.linkedCourses).toHaveLength(2);
    expect(noneMatched.eligibleCourses).toEqual([]);

    const demoMatched = getEligibleCoursesForGroupAndSlot(group, {
      id: "slot-demo",
      courseId: "phys",
    });
    expect(demoMatched.eligibleCourses).toEqual([{ id: "phys", title: "Fisika Dasar IA" }]);
  });

  test("picks an eligible group with remaining quota and matching course first", () => {
    const slot = { id: "slot-1", matchedCourseIds: ["calc"] };
    const groups = [
      {
        id: "exhausted",
        status: "active",
        totalQuotaSessions: 10,
        usedQuotaSessions: 10,
        courses: [{ courseId: "calc", course: { id: "calc", title: "Kalkulus" } }],
      },
      {
        id: "wrong-course",
        status: "active",
        totalQuotaSessions: 10,
        usedQuotaSessions: 2,
        courses: [{ courseId: "chem", course: { id: "chem", title: "Kimia" } }],
      },
      {
        id: "ready",
        status: "active",
        totalQuotaSessions: 10,
        usedQuotaSessions: 2,
        courses: [{ courseId: "calc", course: { id: "calc", title: "Kalkulus" } }],
      },
    ];

    expect(pickDefaultGroupId(groups, slot)).toBe("ready");
    expect(pickDefaultGroupId(groups, slot, "exhausted")).toBe("ready");
    expect(pickDefaultGroupId(groups, slot, "ready")).toBe("ready");
  });
});
