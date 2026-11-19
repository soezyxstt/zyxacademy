import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider, useIsMutating, useQuery } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { TodayPlan } from "@/components/dashboard/today-plan";
import { InterventionBanner } from "@/components/dashboard/intervention-banner";
import { StudyPathTimeline } from "@/components/course/study-path-timeline";
import { createQueryClient } from "@/lib/query/client";
import { queryKeys } from "@/lib/query/keys";
import { studentTodayQuery } from "@/lib/student/today-query";
import student from "@/messages/id/student.json";
import studentCourse from "@/messages/id/studentCourse.json";
import ui from "@/messages/id/ui.json";

declare global {
  interface Window {
    dashboardFixture: { mode: "today" | "study-path" | "intervention" };
  }
}

function TodayQueryProbe() {
  const query = useQuery(studentTodayQuery("fixture-student"));
  const pendingCompletions = useIsMutating({ mutationKey: queryKeys.student.completeToday("fixture-student"), exact: true });
  return <output
    hidden
    data-testid="today-query-probe"
    data-status={query.status}
    data-fetching={String(query.isFetching)}
    data-mutating={pendingCompletions}
    data-completed={query.data?.items.filter(item => item.done).length ?? 0}
  />;
}

function App() {
  const { mode } = window.dashboardFixture;
  return <main className="mx-auto max-w-5xl p-4 text-foreground">
    {mode === "today" && <>
      <TodayPlan firstName="Ayu" serverUserId="fixture-student" />
      <TodayQueryProbe />
    </>}
    {mode === "study-path" && <StudyPathTimeline courseId="fixture-course" />}
    {mode === "intervention" && <InterventionBanner />}
  </main>;
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={createQueryClient()}>
    <NextIntlClientProvider locale="id" timeZone="UTC" messages={{ student, studentCourse, ui }}>
      <App />
    </NextIntlClientProvider>
  </QueryClientProvider>,
);
