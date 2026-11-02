import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { auth } from "@/lib/auth";
import { hasAnyPeran } from "@/lib/auth/authorization";
import { ApplicationPage } from "@/components/application-page";
import { PageHeader } from "@/components/page-header";
import { StudentScheduleClient, ScheduleCalendarSkeleton } from "./schedule-client";
import { TranslatedText } from "@/components/i18n/translated-text";

export default async function StudentSchedulePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) redirect("/");

  const legacyRole = (session.user as { role?: string | null }).role;
  const isAdmin = legacyRole === "admin" || await hasAnyPeran(session.user.id, ["admin"], { allowAdmin: false });
  if (isAdmin) redirect("/admin/schedules");

  const isTutor = legacyRole === "teacher" || await hasAnyPeran(session.user.id, ["tutor"], { allowAdmin: false });
  if (isTutor) redirect("/tutor/schedule");

  return (
    <Suspense
      fallback={
        <ApplicationPage spacing="space-y-4">
          <PageHeader icon={CalendarDays} title={<TranslatedText namespace="student" messageKey="schedule.title" />} />
          <ScheduleCalendarSkeleton />
        </ApplicationPage>
      }
    >
      <StudentScheduleClient />
    </Suspense>
  );
}
