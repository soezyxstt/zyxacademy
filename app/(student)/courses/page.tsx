import { StudentCourseCatalogView } from "@/components/course/student-course-catalog-view";
import type { Metadata } from "next";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import { env } from "@/lib/env";
import { createMetadata} from "@/lib/site";
import { getAuthSession } from "@/lib/auth-session";
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
import { getWhatsAppAdminChatHref } from "@/lib/whatsapp-admin";
import { type CourseGroup } from "./course-catalog-client";
import { getTranslations } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("learning");
  return createMetadata({ title: t("metadata.catalogTitle"), description: t("metadata.catalogDescription"), path: "/courses" });
}


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

/**
 * Server component page for browsing course catalog grouped by academic major.
 */
export default async function CoursesPage() {
  const session = await getAuthSession();
  let studentMajor: string | null = null;
  let studentEntryYear: number | null = null;

  if (session?.user?.id) {
    studentMajor = (session.user as any)?.major ?? null;
    studentEntryYear = (session.user as any)?.entryYear ?? null;
    if (!studentMajor || !studentEntryYear) {
      const [dbUser] = await db
        .select({
          major: userTable.major,
          entryYear: userTable.entryYear,
        })
        .from(userTable)
        .where(eq(userTable.id, session.user.id))
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
    (c) => !TEST_COURSE_IDS.has(c.id) && (c.id !== PKA_COURSE_ID || env.FEATURE_PKA === "1")
  );

  const coursesWithStats = await attachCourseCatalogStats(courses);

  const groupsMap = new Map<string, typeof coursesWithStats>();
  for (const course of coursesWithStats) {
    const formatted = formatCategoryName(course.category);
    const existing = groupsMap.get(formatted) ?? [];
    existing.push(course);
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

  const whatsappHref = getWhatsAppAdminChatHref();

  return <StudentCourseCatalogView groups={groups} studentTargetCategory={studentTargetCategory} whatsappHref={whatsappHref} />;
}
