"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { StudentApplicationShell } from "@/components/student-application-shell";
import { MobileNavTitle } from "@/components/mobile-nav-title";
import { StudentExperienceProvider } from "@/components/student-experience-provider";
import { useAppLocale } from "@/lib/i18n/client";
import { demoRoute, demoStudentHref, demoStudentPath, type DemoRouteView } from "@/lib/demo/routes";
import { overlayKey } from "@/lib/demo/session-overlay";
import { demoWeeklyActivity } from "@/lib/demo/progress-overlay";
import { formatIsoDate } from "@/lib/date-utils";
import type { DemoExperience, DemoProductSelection } from "@/app/(marketing)/demo/demo-data";
import { demoSelectionHref } from "@/lib/demo/selection";
import { DemoSession, useDemoSession } from "./demo-session";
import { DemoGamificationProvider } from "./demo-gamification-provider";

export type DemoSummary = { snapshot: DemoExperience["snapshot"]; content: Pick<DemoExperience["content"], "course"> & { article?: Pick<DemoExperience["content"]["article"], "id" | "title"> } };
export type DemoView = DemoRouteView;
export function DemoShell({ experiences, selected, activeView, children, selection = {}, reviewScope, showLive = false }: { experiences: DemoSummary[]; selected: DemoSummary; activeView: DemoView; children: ReactNode; selection?: DemoProductSelection; reviewScope?: { setId: string; offset: number }; showLive?: boolean }) {
  return <DemoSession key={overlayKey(selected.snapshot.courseId, selected.snapshot.revision)} courseId={selected.snapshot.courseId} revision={selected.snapshot.revision} reviewScope={reviewScope} scopes={experiences.map(({ snapshot }) => ({ courseId: snapshot.courseId, revision: snapshot.revision }))}><Shell experiences={experiences} selected={selected} activeView={activeView} selection={selection} showLive={showLive}>{children}</Shell></DemoSession>;
}
function Shell({ experiences, selected, activeView, children, selection = {}, showLive }: { experiences: DemoSummary[]; selected: DemoSummary; activeView: DemoView; children: ReactNode; selection?: DemoProductSelection; showLive: boolean }) {
  const { locale } = useAppLocale();
  const searchParams = useSearchParams();
  const scheduleCourse = searchParams.get("course");
  const { reset, record, generation, ready, overlay } = useDemoSession();
  const [today, setToday] = useState(selected.snapshot.asOf);
  useEffect(() => setToday(formatIsoDate(new Date())), []);
  const route = (view: string, courseId = selected.snapshot.courseId) => {
    const base = demoRoute(locale, view as DemoRouteView, courseId);
    return courseId === selected.snapshot.courseId ? demoSelectionHref(base, selection) : base;
  };
  const href = (path: string) => demoStudentHref(locale, path, selected.snapshot.courseId);
  const localeHref = (nextLocale: typeof locale) => {
    const base = activeView === "schedule" ? demoStudentHref(nextLocale, `/dashboard/schedule${scheduleCourse ? `?course=${encodeURIComponent(scheduleCourse)}` : ""}`, selected.snapshot.courseId) : demoRoute(nextLocale, activeView, selected.snapshot.courseId);
    const url = new URL(demoSelectionHref(base, selection), window.location.origin);
    if (activeView === "leaderboard" || activeView === "achievements") {
      for (const key of activeView === "achievements" ? ["tab"] : ["tab", "academic", "academicCourse", "period", "scope"]) {
        const value = searchParams.get(key);
        if (value) url.searchParams.set(key, value);
      }
    }
    return `${url.pathname}${url.search}`;
  };
  return <StudentExperienceProvider value={{
    changeLocale: nextLocale => window.location.assign(localeHref(nextLocale)),
    mode: "demo", route, href, pathname: demoStudentPath(activeView, selected.snapshot.courseId),
    account: { name: selected.snapshot.displayName, email: "pelajar@example.test" },
    courses: experiences.map(item => item.content.course),
    streak: { current: selected.snapshot.streakDays, weeklyActivity: demoWeeklyActivity(selected.snapshot, overlay, today) },
    courseHref: id => route("overview", id), baseline: experiences.map(item => item.snapshot),
    selectedCourseId: selected.snapshot.courseId, overlay, ready, record, reset,
  }}><DemoGamificationProvider name={selected.snapshot.displayName}><StudentApplicationShell personalizeTypographyAndSpacing showLive={showLive}><div key={generation}>{!["dashboard", "courses", "groups", "leaderboard", "achievements", "profile", "profile-edit", "reflections", "settings", "notifications", "feedback", "schedule"].includes(activeView) && <MobileNavTitle title={selected.content.course.title} />}{children}</div></StudentApplicationShell></DemoGamificationProvider></StudentExperienceProvider>;
}
