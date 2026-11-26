import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth-session";
import { ensureLegacyIdentity } from "@/lib/auth/legacy-identity";
import { hasAnyPeran } from "@/lib/auth/request-cache";
import type { ReactNode } from "react";
import { TutorSidebar, type AssignedTutorCourse } from "@/components/tutor/tutor-sidebar";
import { ApplicationShell } from "@/components/application-shell";
import {
  TutorMobileBottomNav,
  TutorMobileCourseTabNav,
  TutorMobileTopNav,
} from "@/components/navigation/tutor";
import { listTutorAccessibleCourses } from "@/lib/auth/request-cache";
import { db } from "@/db";
import { mataKuliah, courses } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { GuidedTourProvider } from "@/components/onboarding/guided-tour";
import { CommandMenuProvider } from "@/components/command-menu";
import { PushPermissionInit } from "@/components/notifications/push-permission-init";
import { AppDownloadReminder } from "@/components/native/app-download-reminder";
import { getDownloadChannel } from "@/lib/native/published-release";

export default async function TutorLayout({ children }: { children: ReactNode }) {
  const session = await getAuthSession();
  if (!session?.user) redirect("/");
  await ensureLegacyIdentity(session.user.id);

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
    <GuidedTourProvider role="tutor" courseId={assignedCourses[0]?.courseId ?? null}>
    <CommandMenuProvider>
      <ApplicationShell
        personalizeTypographyAndSpacing
        desktopSidebar={<TutorSidebar assignedCourses={assignedCourses} />}
        mobileTopNav={<TutorMobileTopNav assignedCourses={assignedCourses} />}
        mobileBottomNav={<TutorMobileBottomNav assignedCourses={assignedCourses} />}
        overlays={<><PushPermissionInit /><AppDownloadReminder channel={getDownloadChannel()} /></>}
      >
        <TutorMobileCourseTabNav assignedCourses={assignedCourses} />
        {children}
      </ApplicationShell>
    </CommandMenuProvider>
    </GuidedTourProvider>
  );
}
