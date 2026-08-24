import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { hasAnyPeran } from "@/lib/auth/authorization";
import type { ReactNode } from "react";
import { TutorSidebar, type AssignedTutorCourse } from "@/components/tutor/tutor-sidebar";
import { PageOrnaments } from "@/components/ui/page-ornaments";
import { listTutorAccessibleCourses } from "@/lib/auth/tutor-access";
import { db } from "@/db";
import { mataKuliah, courses } from "@/db/schema";
import { inArray } from "drizzle-orm";

export default async function TutorLayout({ children }: { children: ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
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
    <div className="relative flex min-h-screen flex-row bg-background overflow-x-clip">
      <PageOrnaments variant="about" />
      <TutorSidebar assignedCourses={assignedCourses} />
      <main
        id="main-content"
        tabIndex={-1}
        className="relative z-10 min-w-0 flex-1 focus:outline-none"
      >
        {children}
      </main>
    </div>
  );
}
