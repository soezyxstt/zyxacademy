import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth-session";
import { hasAnyPeran } from "@/lib/auth/authorization";
import type { ReactNode } from "react";
import { TutorSidebar, type AssignedTutorCourse } from "@/components/tutor/tutor-sidebar";
import { ApplicationShell } from "@/components/application-shell";
import { MobileNavbar } from "@/components/mobile-navbar";
import { listTutorAccessibleCourses } from "@/lib/auth/tutor-access";
import { db } from "@/db";
import { mataKuliah, courses } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { CommandMenuProvider } from "@/components/command-menu";

export default async function TutorLayout({ children }: { children: ReactNode }) {
  const session = await getAuthSession();
  if (!session?.user) redirect("/");

  const isAuthorized = await hasAnyPeran(session.user.id, ["tutor"], { allowAdmin: false });
  if (!isAuthorized) redirect("/");

  const accessible = await listTutorAccessibleCourses(session.user.id, { allowAdmin: false });

  let assignedCourses: AssignedTutorCourse[] = [];
  if (accessible.length > 0) {
    const canonicalIds = accessible.map((c) => c.courseId);
    const legacyIds = accessible
      .map((c) => c.legacyCourseId ?? c.courseId)
      .filter((id): id is string => Boolean(id));

    const mkRows = await db
      .select({
        id: mataKuliah.id,
        title: mataKuliah.title,
        code: mataKuliah.code,
        legacyCourseId: mataKuliah.legacyCourseId,
      })
      .from(mataKuliah)
      .where(inArray(mataKuliah.id, canonicalIds));

    const legacyRows =
      legacyIds.length > 0
        ? await db
            .select({
              id: courses.id,
              title: courses.title,
            })
            .from(courses)
            .where(inArray(courses.id, legacyIds))
        : [];

    const mkMap = new Map(mkRows.map((m) => [m.id, m]));
    const legacyMap = new Map(legacyRows.map((l) => [l.id, l]));

    assignedCourses = accessible.map((item) => {
      const mk = mkMap.get(item.courseId);
      const legacy = legacyMap.get(item.legacyCourseId ?? item.courseId);
      return {
        courseId: item.courseId,
        title: mk?.title ?? legacy?.title ?? item.courseId,
        code: mk?.code ?? null,
        legacyCourseId: item.legacyCourseId,
        source: item.source,
        isCompatibilityFallback: item.isCompatibilityFallback,
      };
    });
  }

  return (
    <CommandMenuProvider>
      <ApplicationShell
        sidebar={<TutorSidebar assignedCourses={assignedCourses} />}
        mobileNavigation={<MobileNavbar surface="tutor" />}
      >
        {children}
      </ApplicationShell>
    </CommandMenuProvider>
  );
}
