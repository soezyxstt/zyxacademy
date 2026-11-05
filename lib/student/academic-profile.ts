import { ITB_FACULTIES, getMajorsForFaculty } from "@/lib/student/itb-academic-data";
export type AcademicProfile = { faculty: string; major: string; entryYear: number };
export function validateAcademicProfile(value: { faculty: string; major: string; entryYear: string | number }): { profile: AcademicProfile; errorCode?: never } | { profile?: never; errorCode: "facultyRequired" | "majorRequired" | "entryYearInvalid" } {
 const faculty = value.faculty.trim(), major = value.major.trim();
 if (!ITB_FACULTIES.some(item => item.code === faculty)) return { errorCode: "facultyRequired" };
 if (!getMajorsForFaculty(faculty).includes(major)) return { errorCode: "majorRequired" };
 const entryYear = Number.parseInt(String(value.entryYear), 10);
 if (Number.isNaN(entryYear) || entryYear < 2000 || entryYear > new Date().getFullYear() + 1) return { errorCode: "entryYearInvalid" };
 return { profile: { faculty, major, entryYear } };
}
