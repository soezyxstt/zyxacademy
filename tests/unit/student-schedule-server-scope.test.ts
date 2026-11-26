import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

import { filterCourseIdsBySlotRestriction, isMissingTutorSlotCoursesTable } from "@/lib/schedule/slot-courses";

test("the schedule action scopes queries to the resolved course and the current account", async () => {
  const require = createRequire(import.meta.url);
  const { transformSync } = require(process.env.UI_TEST_ESBUILD ?? "esbuild");
  const source = readFileSync("app/(student)/dashboard/schedule/actions.ts", "utf8");
  const section = source.slice(source.indexOf("export async function getScheduleData"), source.indexOf("export interface CollaborativeBookSlotOptions"));
  const table = (name: string) => new Proxy({ name }, { get: (target, key) => key === "name" ? target.name : { table: name, key } });
  const groupMembers = table("groupMembers"), groupCourses = table("groupCourses"), enrollmentTokens = table("enrollmentTokens"), enrollmentTokenCourses = table("enrollmentTokenCourses"), tutorSlots = table("tutorSlots"), tutorSlotCourses = table("tutorSlotCourses"), tutorCourses = table("tutorCourses"), penugasanTutor = table("penugasanTutor"), bookings = table("bookings");
  const pengguna = table("pengguna"), penggunaPeran = table("penggunaPeran"), peran = table("peran");
  const courses = [{ groupId: "mine", courseId: "legacy-a" }, { groupId: "mine", courseId: "b" }, { groupId: "other", courseId: "legacy-a" }];
  const tokenCourseRows = [{ tokenId: "tok-1", groupId: "token-only", courseId: "legacy-a" }];
  const slotCourseRows: Array<{ slotId: string; courseId: string }> = [];
  const assignments = [{ tutorId: "tutor-a", courseId: "legacy-a" }, { tutorId: "tutor-b", courseId: "b" }, { tutorId: "revoked", courseId: "legacy-a" }, { tutorId: "chapter-only", courseId: "legacy-a" }, { tutorId: "admin-tutor", courseId: "legacy-a" }, { tutorId: "suspended-fallback", courseId: "legacy-a" }, { tutorId: "legacy-only", courseId: "b" }];
  const canonicalAssignments = [
    { penggunaId: "tutor-c", mataKuliahId: "canonical-a", status: "active", assignmentScope: "course", legacyCourseId: "legacy-a", courseStatus: "active" },
    { penggunaId: "revoked", mataKuliahId: "canonical-a", status: "revoked", assignmentScope: "course", legacyCourseId: "legacy-a", courseStatus: "active" },
    { penggunaId: "chapter-only", mataKuliahId: "canonical-a", status: "active", assignmentScope: "chapter", legacyCourseId: "legacy-a", courseStatus: "active" },
    { penggunaId: "tutor-a", mataKuliahId: "canonical-b", status: "revoked", assignmentScope: "course", legacyCourseId: "b", courseStatus: "active" },
    { penggunaId: "suspended", mataKuliahId: "canonical-a", status: "active", assignmentScope: "course", legacyCourseId: "legacy-a", courseStatus: "active" },
    { penggunaId: "not-tutor", mataKuliahId: "canonical-a", status: "active", assignmentScope: "course", legacyCourseId: "legacy-a", courseStatus: "active" },
    { penggunaId: "admin-tutor", mataKuliahId: "canonical-a", status: "revoked", assignmentScope: "course", legacyCourseId: "legacy-a", courseStatus: "active" },
  ];
  const identities = [
    ...["tutor-a", "tutor-b", "tutor-c", "revoked", "chapter-only"].map((id) => ({ id, status: "active", code: "tutor" })),
    { id: "suspended", status: "suspended", code: "tutor" },
    { id: "not-tutor", status: "active", code: "murid" },
    { id: "admin-tutor", status: "active", code: "admin" },
    { id: "admin-unassigned", status: "active", code: "admin" },
    { id: "suspended-fallback", status: "suspended", code: "tutor" },
  ];
  const mappedCourses = [
    { id: "canonical-a", legacyCourseId: "legacy-a", status: "active" },
    { id: "archived-a", legacyCourseId: "legacy-a", status: "archived" },
  ];
  const memberships = [
    { userId: "me", groupId: "mine", group: { id: "mine", courses: courses.filter((row) => row.groupId === "mine"), tokens: [] } },
    { userId: "me", groupId: "token-only", group: { id: "token-only", courses: [], tokens: [{ id: "tok-1", createdAt: new Date("2026-11-01T00:00:00Z"), tokenCourses: [{ courseId: "legacy-a", course: { id: "legacy-a", title: "Matematika" } }] }] } },
    { userId: "someone-else", groupId: "other", group: { id: "other", courses: courses.filter((row) => row.groupId === "other"), tokens: [] } },
  ];
  const slots = assignments.map((row) => ({ id: row.tutorId, tutorId: row.tutorId, tutor: { tutorCourses: [row] }, bookings: [] as Array<{ id: string; topic?: string }> }));
  slots[0].bookings.push({ id: "other-booking", topic: "private topic" });
  slots.push({ id: "tutor-c", tutorId: "tutor-c", tutor: { tutorCourses: [] }, bookings: [] });
  slots.push({ id: "suspended", tutorId: "suspended", tutor: { tutorCourses: [] }, bookings: [] });
  slots.push({ id: "not-tutor", tutorId: "not-tutor", tutor: { tutorCourses: [] }, bookings: [] });
  slots.push({ id: "admin-unassigned", tutorId: "admin-unassigned", tutor: { tutorCourses: [] }, bookings: [] });
  const bookingRows = [{ id: "a", groupId: "mine", courseId: "legacy-a" }, { id: "b", groupId: "mine", courseId: "b" }, { id: "private", groupId: "other", courseId: "legacy-a" }];
  const schedules = [{ id: "a", courseId: "legacy-a", status: "published" }, { id: "b", courseId: "b", status: "published" }, { id: "global", courseId: null, status: "published" }];
  const evalWhere = (predicate: any, row: any): boolean => {
    if (!predicate) return true;
    if (predicate.op === "and") return predicate.args.every((part: any) => evalWhere(part, row));
    if (predicate.op === "or") return predicate.args.some((part: any) => evalWhere(part, row));
    if (predicate.op === "eq") return row[predicate.column.key] === predicate.value;
    if (predicate.op === "in") return (Array.isArray(predicate.values) ? predicate.values : predicate.values.rows).includes(row[predicate.column.key]);
    if (predicate.op === "notIn") return !(Array.isArray(predicate.values) ? predicate.values : predicate.values.rows).includes(row[predicate.column.key]);
    return true;
  };
  const db = {
    select: (fields: any) => ({ from: (sourceTable: any) => {
      const joined = {
        innerJoin: () => joined,
        where: (predicate: any) => {
          if (sourceTable.name === "enrollmentTokens") {
            const rows = tokenCourseRows.filter((row) => evalWhere(predicate, row));
            return Object.assign(Promise.resolve(rows), { rows: rows.map((row) => row.groupId) });
          }
          const rows = sourceTable.name === "pengguna"
            ? identities.filter((row) => evalWhere(predicate, row)).map((row) => ({ id: row.id, role: row.code }))
            : canonicalAssignments.filter((row) => evalWhere(predicate, row)).map((row) => ({ ...row, tutorId: row.penggunaId, courseId: row.mataKuliahId, scope: row.assignmentScope }));
          return Object.assign(Promise.resolve(rows), { rows: rows.map((row: any) => row.id) });
        },
      };
      return {
        where: (predicate: any) => sourceTable.name === "mataKuliah"
          ? Promise.resolve(mappedCourses.filter((row) => evalWhere(predicate, row)))
          : sourceTable.name === "tutorSlotCourses"
            ? Promise.resolve(slotCourseRows.filter((row) => evalWhere(predicate, row)))
            : ({ rows: (sourceTable.name === "groupCourses" ? courses : sourceTable.name === "tutorCourses" ? assignments : canonicalAssignments).filter((row) => evalWhere(predicate, row)).map((row: any) => row[fields.id.key]) }),
        innerJoin: () => joined,
      };
    } }),
    query: {
      user: { findFirst: async () => ({ id: "me", role: "admin" }) },
      groupMembers: { findMany: async ({ where, with: relations }: any) => memberships.filter((row) => evalWhere(where, row)).map((row) => ({ ...row, group: { ...row.group, courses: row.group.courses.filter((course) => evalWhere(relations.group.with.courses.where, course)), tokens: (row.group.tokens ?? []).map((tok: any) => ({ ...tok, tokenCourses: tok.tokenCourses.filter((tc: any) => evalWhere(relations.group.with.tokens.with.tokenCourses.where, tc)) })) } })) },
      tutorSlots: { findMany: async ({ where, with: relations }: any) => slots.filter((row) => evalWhere(where, row)).map((row) => ({ ...row, bookings: row.bookings.map((booking: any) => relations.bookings.columns.id ? { id: booking.id } : booking), tutor: { ...row.tutor, tutorCourses: row.tutor.tutorCourses.filter((course) => evalWhere(relations.tutor.with.tutorCourses.where, course)) } })) },
      bookings: { findMany: async ({ where }: any) => bookingRows.filter((row) => evalWhere(where, row)) },
    },
  };
  const module = { exports: {} as any };
  const predicate = (op: string) => (...args: any[]) => ({ op, args });
  runInNewContext(transformSync(section, { loader: "ts", format: "cjs" }).code, {
    module, exports: module.exports, db, groupMembers, groupCourses, enrollmentTokens, enrollmentTokenCourses, tutorSlots, tutorSlotCourses, tutorCourses, penugasanTutor, mataKuliah: table("mataKuliah"), pengguna, penggunaPeran, peran, bookings,
    user: table("user"), bookingAuditLogs: table("bookingAuditLogs"), bookingRescheduleTickets: table("bookingRescheduleTickets"), bookingTicketMessages: table("bookingTicketMessages"),
    eq: (column: any, value: any) => ({ op: "eq", column, value }), inArray: (column: any, values: any) => ({ op: "in", column, values }), notInArray: (column: any, values: any) => ({ op: "notIn", column, values }), and: predicate("and"), or: predicate("or"),
    gte: () => ({}), lte: () => ({}), isNull: () => ({}), isNotNull: () => ({}), desc: () => ({}),
    requireUser: async () => ({ id: "me" }), resolveCourseIdentity: async (id: string) => id === "unknown" ? null : id === "b" ? { status: "active", canonicalId: null, allIds: ["b"] } : { status: "active", canonicalId: "canonical-a", allIds: ["canonical-a", "legacy-a"] },
    filterCourseIdsBySlotRestriction, isMissingTutorSlotCoursesTable,
    getJakartaNow: () => new Date("2026-11-14T00:00:00Z"), daysFrom: (_offset: number, date: Date) => date,
    getWeekScheduleDays: () => ({ days: [{ dateIso: "2026-11-09" }] }), getIsoWeekRange: () => ({ startIso: "2026-11-09", endIso: "2026-11-15" }),
    getStudentAcademicCalendar: async (_start: string, _end: string, courseIds?: string[]) =>
      schedules.filter(row => row.status === "published" && (!courseIds || courseIds.includes(row.courseId))),
    getGroupWeeklyUsage: async () => new Map(), listStudentEnrollments: async () => [{ id: "legacy-a" }, { id: "b" }], occupiesTutorSlot: () => ({}),
  });
  for (const alias of ["canonical-a", "legacy-a"]) {
    const result = await module.exports.getScheduleData(0, alias);
    expect(result.role).toBe("student");
    expect(result.user.role).toBe("admin");
    expect(result.availableSlots.map((row: any) => row.id)).toEqual(["tutor-a", "admin-tutor", "tutor-c", "admin-unassigned"]);
    expect(result.availableSlots[2].matchedCourseIds).toEqual(["canonical-a", "legacy-a"]);
    expect(result.availableSlots[0].booking).toEqual({ id: "other-booking" });
    expect(JSON.stringify(result.availableSlots)).not.toContain("private topic");
    expect(result.groupBookings.map((row: any) => row.id)).toEqual(["a"]);
    expect(result.academicSchedules.map((row: any) => row.id)).toEqual(["a"]);
    expect(result.groups.map((row: any) => row.id)).toEqual(["mine", "token-only"]);
    expect(result.groups[0].courses.map((row: any) => row.courseId)).toEqual(["legacy-a"]);
    expect(result.groups[1].courses.map((row: any) => row.courseId)).toEqual(["legacy-a"]);
    expect(result.enrollments.map((row: any) => row.id)).toEqual(["legacy-a"]);
  }
  const global = await module.exports.getScheduleData();
  expect(global.availableSlots).toHaveLength(6);
  expect(global.groups.find((g: any) => g.id === "token-only").courses.map((row: any) => row.courseId)).toEqual(["legacy-a"]);
  expect(global.availableSlots.find((slot: any) => slot.id === "tutor-c").matchedCourseIds).toEqual(["canonical-a", "legacy-a"]);
  expect(global.availableSlots.find((slot: any) => slot.id === "revoked")).toBeUndefined();
  expect(global.availableSlots.find((slot: any) => slot.id === "chapter-only")).toBeUndefined();
  expect(global.availableSlots.find((slot: any) => slot.id === "suspended")).toBeUndefined();
  expect(global.availableSlots.find((slot: any) => slot.id === "not-tutor")).toBeUndefined();
  expect(global.availableSlots.find((slot: any) => slot.id === "admin-tutor").matchedCourseIds).toEqual(["canonical-a", "legacy-a"]);
  expect(global.availableSlots.find((slot: any) => slot.id === "admin-unassigned").matchedCourseIds).toEqual(["canonical-a", "legacy-a"]);
  expect(global.availableSlots.find((slot: any) => slot.id === "suspended-fallback")).toBeUndefined();
  expect(global.availableSlots.find((slot: any) => slot.id === "legacy-only").matchedCourseIds).toEqual(["b"]);
  expect(global.availableSlots.find((slot: any) => slot.id === "tutor-a").matchedCourseIds).toEqual(["legacy-a", "canonical-a"]);
  expect(global.groupBookings.map((row: any) => row.id)).toEqual(["a", "b"]);
  expect(global.academicSchedules).toHaveLength(3);
  const pureLegacy = await module.exports.getScheduleData(0, "b");
  expect(pureLegacy.availableSlots.map((slot: any) => slot.id)).toEqual(["tutor-b", "legacy-only"]);
  slotCourseRows.push({ slotId: "tutor-c", courseId: "canonical-a" });
  const restrictedScoped = await module.exports.getScheduleData(0, "legacy-a");
  expect(restrictedScoped.availableSlots.find((slot: any) => slot.id === "tutor-c").matchedCourseIds).toEqual(["canonical-a", "legacy-a"]);
  slotCourseRows.length = 0;
  slotCourseRows.push({ slotId: "admin-unassigned", courseId: "b" });
  const restrictedOther = await module.exports.getScheduleData(0, "legacy-a");
  expect(restrictedOther.availableSlots.find((slot: any) => slot.id === "admin-unassigned")).toBeUndefined();
  slotCourseRows.length = 0;
  mappedCourses.push({ id: "other-canonical", legacyCourseId: "legacy-a", status: "active" });
  const ambiguous = await module.exports.getScheduleData();
  expect(ambiguous.availableSlots.find((slot: any) => slot.id === "tutor-c")).toBeUndefined();
  expect(ambiguous.availableSlots.find((slot: any) => slot.id === "tutor-a")).toBeUndefined();
  expect(ambiguous.availableSlots.find((slot: any) => slot.id === "admin-unassigned")).toBeUndefined();
  await expect(module.exports.getScheduleData(0, "unknown")).rejects.toThrow("COURSE_NOT_FOUND");
});
