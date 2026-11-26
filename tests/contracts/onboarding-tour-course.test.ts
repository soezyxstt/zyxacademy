import { describe, expect, test } from "bun:test";
import { createTourCourseSelector } from "@/lib/onboarding/tour-course";
import { PKA_COURSE_ID } from "@/lib/pka-config";

type Dependencies = Parameters<typeof createTourCourseSelector>[0];
const studentCourse = (id: string) => ({ id, canonicalId: null, legacyId: id });
const tutorCourse = (courseId: string, legacyCourseId: string | null = null) => ({ courseId, legacyCourseId });

function fixture(overrides: Partial<Dependencies> = {}) {
  const studentReads: string[] = [];
  const enrollmentReads: string[][] = [];
  const tutorReads: Array<{ penggunaId: string; courseId: string; allowAdmin: false }> = [];
  const selectCourse = createTourCourseSelector({
    listStudentEnrollments: async () => [],
    resolveStudentCourse: async id => { studentReads.push(id); return studentCourse(id); },
    isStudentEnrolled: async (...args) => { enrollmentReads.push(args); return true; },
    listTutorAccessibleCourses: async () => [],
    resolveTutorCourseAccess: async input => { tutorReads.push(input); return { ...tutorCourse(input.courseId), hasAccess: true }; },
    resolveCourseIdentity: async canonicalId => ({ canonicalId, legacyId: null, status: "active" }),
    ...overrides,
  });
  return { selectCourse, studentReads, enrollmentReads, tutorReads };
}

describe("tour course selection", () => {
  test("skips stale legacy enrollments and rechecks current access before selecting", async () => {
    const { selectCourse } = fixture({
      listStudentEnrollments: async userId => {
        expect(userId).toBe("account-a");
        return ["archived", "ambiguous", "expired", "valid"].map(studentCourse);
      },
      resolveStudentCourse: async id => ["archived", "ambiguous"].includes(id) ? null : studentCourse(id),
      isStudentEnrolled: async (userId, id) => userId === "account-a" && id === "valid",
    });
    expect(await selectCourse("account-a", "student", "archived")).toBe("valid");
  });

  test("honors an enrolled hint or canonical alias without probing an unrelated client hint", async () => {
    const enrolled = [studentCourse("first"), { id: "preferred", canonicalId: "canonical-preferred", legacyId: "preferred" }];
    const { selectCourse, studentReads, enrollmentReads } = fixture({ listStudentEnrollments: async () => enrolled });
    expect(await selectCourse("account-a", "student", "canonical-preferred")).toBe("preferred");
    expect(studentReads).toEqual(["preferred"]);
    expect(enrollmentReads).toEqual([["account-a", "preferred"]]);
    expect(await selectCourse("account-a", "student", "another-accounts-course")).toBe("first");
    expect(studentReads).not.toContain("another-accounts-course");
  });

  test("excludes PKA identities and returns the general plan only after exhausting candidates", async () => {
    const { selectCourse } = fixture({
      listStudentEnrollments: async () => [studentCourse(PKA_COURSE_ID), studentCourse("pka-alias"), studentCourse("revoked")],
      resolveStudentCourse: async id => id === "pka-alias" ? { id, canonicalId: PKA_COURSE_ID, legacyId: null } : studentCourse(id),
      isStudentEnrolled: async () => false,
    });
    expect(await selectCourse("account-a", "student", null)).toBeNull();
    expect(await fixture().selectCourse("account-a", "student", null)).toBeNull();
  });

  test("tutor replay without a client course discovers the account's active assignment", async () => {
    const { selectCourse, tutorReads } = fixture({
      listTutorAccessibleCourses: async (userId, options) => {
        expect(userId).toBe("account-a");
        expect(options).toEqual({ allowAdmin: false });
        return [tutorCourse("canonical-course", "legacy-course")];
      },
    });
    expect(await selectCourse("account-a", "tutor", null)).toBe("canonical-course");
    expect(tutorReads).toEqual([{ penggunaId: "account-a", courseId: "canonical-course", allowAdmin: false }]);
  });

  test("tutor selection rejects revoked and PKA assignments and resolves a valid hint canonically", async () => {
    const assigned = [tutorCourse("pka", PKA_COURSE_ID), tutorCourse("revoked"), tutorCourse("valid", "valid-alias")];
    const { selectCourse } = fixture({
      listTutorAccessibleCourses: async () => assigned,
      resolveTutorCourseAccess: async input => ({ ...tutorCourse(input.courseId), hasAccess: input.courseId === "valid" }),
    });
    expect(await selectCourse("account-a", "tutor", "revoked")).toBe("valid");
    expect(await selectCourse("account-a", "tutor", "valid-alias")).toBe("valid");
    expect(await fixture().selectCourse("account-a", "tutor", null)).toBeNull();
  });

  test("tutor selection also rejects identities that the document route cannot resolve", async () => {
    const { selectCourse } = fixture({
      listTutorAccessibleCourses: async () => ["ambiguous", "inactive", "mismatched", "valid"].map(id => tutorCourse(id)),
      resolveCourseIdentity: async id => id === "ambiguous" ? null : {
        canonicalId: id === "mismatched" ? "another-course" : id,
        legacyId: null,
        status: id === "inactive" ? "archived" : "active",
      },
    });
    expect(await selectCourse("account-a", "tutor", "ambiguous")).toBe("valid");
  });

  test("data outages propagate so callers can retry without choosing the wrong plan", async () => {
    const { selectCourse } = fixture({ listStudentEnrollments: async () => { throw new Error("catalog unavailable"); } });
    await expect(selectCourse("account-a", "student", null)).rejects.toThrow("catalog unavailable");
  });
});
