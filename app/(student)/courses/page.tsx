import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, MessageCircle } from "lucide-react";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import { ApplicationPage } from "@/components/application-page";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { studentCardClass } from "@/components/course/course-surfaces";
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
import { CourseCatalogClient, type CourseGroup } from "./course-catalog-client";
import { TranslatedText } from "@/components/i18n/translated-text";
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

  return (
    <ApplicationPage className="pb-16">
      <PageHeader
        title={<TranslatedText namespace="learning" messageKey="catalog.pageTitle" />}
        icon={BookOpen}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {whatsappHref && (
              <Button asChild variant="outline" size="sm" className="rounded-lg text-body-sm gap-1.5">
                <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="size-3.5 text-status-success" />
                  <TranslatedText namespace="learning" messageKey="catalog.contactAdmin" />
                </a>
              </Button>
            )}
            <Button asChild size="sm" className="rounded-lg text-body-sm">
              <Link href="/plans"><TranslatedText namespace="learning" messageKey="catalog.viewPlans" /></Link>
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
            <TranslatedText namespace="learning" messageKey="catalog.emptyTitle" />
          </h2>
          <p className="mt-1 text-body-xs text-muted-foreground">
            <TranslatedText namespace="learning" messageKey="catalog.emptyDescription" />
          </p>
        </div>
      )}

        <p className="mt-8 text-body-sm text-muted-foreground">
          <TranslatedText namespace="learning" messageKey="catalog.needMoreAccess" />{" "}
          <Link href="/plans" className="font-semibold text-primary underline-offset-4 hover:underline">
            <TranslatedText namespace="learning" messageKey="catalog.viewPlans" />
          </Link>
          {whatsappHref && (
            <>
              {" "}<TranslatedText namespace="learning" messageKey="catalog.or" />{" "}
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-primary underline-offset-4 hover:underline"
              >
                <TranslatedText namespace="learning" messageKey="catalog.contactWhatsApp" />
              </a>
            </>
          )}
          .
        </p>
    </ApplicationPage>
  );
}
