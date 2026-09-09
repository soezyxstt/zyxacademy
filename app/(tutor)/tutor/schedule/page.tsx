import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { hasAnyPeran } from "@/lib/auth/authorization";
import { getTutorScheduleReadModel } from "@/lib/schedule/tutor-read-model";
import { getJakartaNow, daysFrom } from "@/lib/date-utils";
import { getWeekScheduleDays } from "@/lib/schedule-lock";
import { getTutorialWeekRange } from "@/lib/schedule/week-policy";
import { TutorScheduleView } from "@/components/tutor/tutor-schedule-view";
import { ApplicationPage } from "@/components/application-page";
import { pageTitle } from "@/lib/site";

export const metadata: Metadata = {
  title: pageTitle("Jadwal Pengajar"),
  description: "Kelola slot ketersediaan 90 menit, sesi tutorial kelompok, dan tiket reschedule.",
};

function parseWeekOffset(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = raw ? Number(raw) : 0;
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(-520, Math.min(520, Math.trunc(parsed)));
}

export default async function TutorSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) redirect("/");

  const isAuthorized = await hasAnyPeran(session.user.id, ["tutor"], {
    allowAdmin: true,
  });
  if (!isAuthorized) redirect("/");

  const role = (session.user as { role?: string | null }).role;
  const isAdmin = role === "admin";
  const params = await searchParams;
  const weekOffset = parseWeekOffset(params.week);
  const weekInfo = getWeekScheduleDays(daysFrom(weekOffset * 7, getJakartaNow()));
  const weekRange = getTutorialWeekRange(weekInfo.days[0].dateIso);

  const readModel = await getTutorScheduleReadModel({
    tutorId: session.user.id,
    allowAdmin: isAdmin,
    fromDate: weekRange.startIso,
    toDate: weekRange.endIso,
  });

  return (
    <ApplicationPage>
      <TutorScheduleView
        initialData={readModel}
        currentUserId={session.user.id}
        initialWeekOffset={weekOffset}
      />
    </ApplicationPage>
  );
}
