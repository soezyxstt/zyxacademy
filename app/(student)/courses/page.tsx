import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { BookOpen, MessageCircle } from "lucide-react";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import { ApplicationPage } from "@/components/application-page";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { studentCardClass } from "@/components/course/course-surfaces";
import { env } from "@/lib/env";
import { createMetadata, pageTitle } from "@/lib/site";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { user as userTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { allowedCategories } from "@/app/(admin)/admin/(academic)/courses/constants";
import {
  getStudentTargetCategory,
  isCourseMatchingMajor,
} from "@/lib/student/itb-academic-data";
import {
  getCourseMaterials,
  getCourseQuizzes,
  getCourseTryouts,
} from "@/lib/course-utils";
import { listStudentCourses } from "@/lib/student/course-catalog";
import { getWhatsAppAdminChatHref } from "@/lib/whatsapp-admin";
import { CourseCatalogClient, type CourseGroup } from "./course-catalog-client";

export const metadata: Metadata = createMetadata({
  title: "Katalog Kursus",
  description: "Katalog kursus Zyx Academy; materi terstruktur, latihan soal, dan persiapan ujian akademik.",
  path: "/courses",
});


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
  const session = await auth.api.getSession({ headers: await headers() });
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

  const coursesWithStats = await Promise.all(
    courses.map(async (c) => {
      // Tutorial PKA is a lean campaign course with no standard materials/quizzes/tryouts to count.
      if (c.id === PKA_COURSE_ID) {
        return { ...c, materialsCount: 0, quizzesCount: 0, tryoutsCount: 0 };
      }
      const [materials, quizzes, tryouts] = await Promise.all([
        getCourseMaterials(c.id),
        getCourseQuizzes(c.id),
        getCourseTryouts(c.id),
      ]);
      return {
        ...c,
        materialsCount: materials.length,
        quizzesCount: quizzes.length,
        tryoutsCount: tryouts.length,
      };
    })
  );

  const groupsMap = new Map<string, typeof coursesWithStats>();
  for (const course of coursesWithStats) {
    const formatted = formatCategoryName(course.category);
    const existing = groupsMap.get(formatted) ?? [];
    existing.push(course);
    groupsMap.set(formatted, existing);
  }

  const studentTargetCategory = getStudentTargetCategory(studentMajor, studentEntryYear);
  const normTarget = studentTargetCategory ? formatCategoryName(studentTargetCategory) : null;

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

  return (
    <ApplicationPage className="pb-16">
      <PageHeader
        title="Katalog Course"
        icon={BookOpen}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {whatsappHref && (
              <Button asChild variant="outline" size="sm" className="rounded-lg text-body-sm gap-1.5">
                <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="size-3.5 text-status-success" />
                  Hubungi admin
                </a>
              </Button>
            )}
            <Button asChild size="sm" className="rounded-lg text-body-sm">
              <Link href="/plans">Lihat paket</Link>
            </Button>
          </div>
        }
      />

      {groups.length > 0 ? (
        <CourseCatalogClient
          groups={groups}
          studentTargetCategory={studentTargetCategory}
        />
      ) : (
        <div className={studentCardClass("py-12 text-center max-w-md mx-auto")}>
          <BookOpen className="mx-auto size-10 text-muted-foreground/40 mb-3" />
          <h2 className="font-heading text-body-base font-bold text-foreground">
            Belum ada course yang tersedia
          </h2>
          <p className="mt-1 text-body-xs text-muted-foreground">
            Course akan ditampilkan di sini setelah dipublikasikan.
          </p>
        </div>
      )}

        <p className="mt-8 text-body-sm text-muted-foreground">
          Perlu akses tambahan?{" "}
          <Link href="/plans" className="font-semibold text-primary underline-offset-4 hover:underline">
            Lihat paket
          </Link>
          {whatsappHref && (
            <>
              {" "}atau{" "}
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-primary underline-offset-4 hover:underline"
              >
                hubungi kami di WhatsApp
              </a>
            </>
          )}
          .
        </p>
    </ApplicationPage>
  );
}
