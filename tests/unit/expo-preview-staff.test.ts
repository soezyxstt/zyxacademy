import { expect, test } from "bun:test";
import { containsStaffRecord, matchesStaffContext, oppositeStaffRole, staffRole, staffRoles } from "../../scripts/native-readiness/product-auth/staff-role";

const identity = { accountId: "verified-account", sessionId: "verified-session" };

test("staff preview accepts only reviewed roles and requires exact session and sole role", () => {
  expect(staffRole(undefined)).toBeUndefined();
  expect(staffRole("student")).toBeUndefined();
  expect(staffRole("tutor")).toBe("tutor");
  expect(staffRole("admin")).toBe("admin");
  expect(() => staffRole("unknown")).toThrow();
  for (const role of ["tutor", "admin"] as const) {
    const other = oppositeStaffRole(role);
    const payload = { ...identity, roles: [role] };
    expect(matchesStaffContext(role, payload, identity)).toBe(true);
    expect(matchesStaffContext(role, { ...payload, roles: [other] }, identity)).toBe(false);
    expect(matchesStaffContext(role, { ...payload, roles: [role, other] }, identity)).toBe(false);
    expect(matchesStaffContext(role, { ...payload, sessionId: "previous-session" }, identity)).toBe(false);
    expect(matchesStaffContext(role, { ...payload, accountId: "other-account" }, identity)).toBe(false);
  }
});

test("staff preview requires the synthetic record from the corresponding canonical read response", () => {
  const tutor = staffRoles.tutor;
  const admin = staffRoles.admin;
  const courses = [{ courseId: tutor.recordId, title: tutor.recordTitle }];
  const forms = [{ id: admin.recordId, title: admin.recordTitle }];
  expect(containsStaffRecord("tutor", { courses })).toBe(true);
  expect(containsStaffRecord("tutor", { courses: [] })).toBe(false);
  expect(containsStaffRecord("tutor", { courses: [{ ...courses[0], courseId: "other-course" }] })).toBe(false);
  expect(containsStaffRecord("admin", { success: true, forms })).toBe(true);
  expect(containsStaffRecord("admin", { success: false, forms })).toBe(false);
  expect(containsStaffRecord("admin", { success: true, forms: [{ ...forms[0], title: "Wrong form" }] })).toBe(false);
  expect(containsStaffRecord("admin", { courses })).toBe(false);
  expect(containsStaffRecord("tutor", { success: true, forms })).toBe(false);
});
