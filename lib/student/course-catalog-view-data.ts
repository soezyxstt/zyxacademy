import { db } from "@/db";
import { user as userTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { allowedCategories } from "@/app/(admin)/admin/(academic)/courses/constants";
import {
  getStudentTargetCategory,
  isCourseMatchingMajor,
} from "@/lib/student/itb-academic-data";
import { attachCourseCatalogStats } from "@/lib/student/course-catalog-stats";
import { listStudentCourses } from "@/lib/student/course-catalog";
import { resolveCourseEntitlementsBatch } from "@/lib/student/course-access";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import { isPkaEnrolled } from "@/lib/pka-enrollment";
import { type CourseGroup } from "@/app/(student)/courses/course-catalog-client";

/**
 * Normalizes course category string to a consistent display title from the predefined category catalog.
 */
function formatCategoryName(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.toUpperCase() === "TPB") return "TPB";
  if (trimmed.toUpperCase() === "PKA") return "PKA";
  const matched = allowedCategories.find(
    (c) => c.toLowerCase() === trimmed.toLowerCase()
  );
  if (matched) return matched;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export async function loadStudentCourseCatalog(
  studentId?: string,
  academicProfile?: { major: string | null; entryYear: number | null },
) {
  let studentMajor = academicProfile?.major ?? null;
  let studentEntryYear = academicProfile?.entryYear ?? null;

  if (studentId) {
    if (!studentMajor || !studentEntryYear) {
      const [dbUser] = await db
        .select({
          major: userTable.major,
          entryYear: userTable.entryYear,
        })
        .from(userTable)
        .where(eq(userTable.id, studentId))
        .limit(1);

      if (dbUser) {
        studentMajor = studentMajor || dbUser.major;
        studentEntryYear = studentEntryYear ?? dbUser.entryYear;
      }
    }
  }

  const dbCourses = await listStudentCourses();
  const TEST_COURSE_IDS = new Set([
    "embed-test-course",
    "miscon-test-course",
    "remed-test-course",
    "term-test-course",
    "graph-test-course",
  ]);
  const courses = dbCourses.filter(
    (c) => !TEST_COURSE_IDS.has(c.id)
  );

  const standardCourseIds = courses.filter((course) => course.id !== PKA_COURSE_ID).map((course) => course.id);
  const [coursesWithStats, entitlements, pkaAccess] = await Promise.all([
    attachCourseCatalogStats(courses),
    studentId ? resolveCourseEntitlementsBatch(studentId, standardCourseIds) : undefined,
    studentId && courses.some((course) => course.id === PKA_COURSE_ID)
      ? isPkaEnrolled(studentId)
      : undefined,
  ]);

  const groupsMap = new Map<string, CourseGroup["courses"]>();
  for (const course of coursesWithStats) {
    const formatted = formatCategoryName(course.category);
    const existing = groupsMap.get(formatted) ?? [];
    existing.push({
      ...course,
      hasFullContentAccess: course.id === PKA_COURSE_ID
        ? pkaAccess
        : entitlements?.get(course.id)?.hasFullContentAccess,
    });
    groupsMap.set(formatted, existing);
  }

  const studentTargetCategory = getStudentTargetCategory(studentMajor, studentEntryYear);

  const groups: CourseGroup[] = Array.from(groupsMap.entries()).map(([jurusan, items]) => ({
    jurusan,
    isStudentMajor: Boolean(
      studentTargetCategory &&
      isCourseMatchingMajor(jurusan, studentMajor, studentEntryYear)
    ),
    courses: items,
  }));

  // Sort groups: student major first, then TPB, then alphabetical
  groups.sort((a, b) => {
    if (a.isStudentMajor && !b.isStudentMajor) return -1;
    if (!a.isStudentMajor && b.isStudentMajor) return 1;
    if (a.jurusan === "TPB" && b.jurusan !== "TPB") return -1;
    if (a.jurusan !== "TPB" && b.jurusan === "TPB") return 1;
    return a.jurusan.localeCompare(b.jurusan);
  });

  return { groups, studentTargetCategory };
}
