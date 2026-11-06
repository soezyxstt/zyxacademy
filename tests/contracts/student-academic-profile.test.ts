import { expect, test } from "bun:test";
import { validateAcademicProfile } from "@/lib/student/academic-profile";
test("live and fictional academic profiles use the same faculty, major and year validation", () => {
 const input = { faculty: "STEI", major: "Teknik Informatika", entryYear: "2026" };
 expect(validateAcademicProfile(input)).toEqual({ profile: { ...input, entryYear: 2026 } });
 expect(validateAcademicProfile({ ...input, faculty: "unknown" }).errorCode).toBe("facultyRequired");
 expect(validateAcademicProfile({ ...input, major: "Fisika" }).errorCode).toBe("majorRequired");
 expect(validateAcademicProfile({ ...input, entryYear: "1999" }).errorCode).toBe("entryYearInvalid");
});
