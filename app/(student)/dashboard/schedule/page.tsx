import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasAnyPeran } from "@/lib/auth/authorization";
import { StudentScheduleClient } from "./schedule-client";
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
        <div className="p-16 text-center text-muted-foreground text-body-sm">
          <TranslatedText namespace="student" messageKey="schedule.loading" />
        </div>
      }
    >
      <StudentScheduleClient />
    </Suspense>
  );
}
