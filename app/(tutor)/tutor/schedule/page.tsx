import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { hasAnyPeran } from "@/lib/auth/authorization";
import { getTutorScheduleReadModel } from "@/lib/schedule/tutor-read-model";
import { TutorScheduleView } from "@/components/tutor/tutor-schedule-view";
import { ApplicationPage } from "@/components/application-page";
import { pageTitle } from "@/lib/site";

export const metadata: Metadata = {
  title: pageTitle("Jadwal Pengajar"),
  description: "Kelola slot ketersediaan 90 menit, sesi tutorial kelompok, dan tiket reschedule.",
};

export default async function TutorSchedulePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) redirect("/");

  const isAuthorized = await hasAnyPeran(session.user.id, ["tutor"], {
    allowAdmin: true,
  });
  if (!isAuthorized) redirect("/");

  const role = (session.user as { role?: string | null }).role;
  const isAdmin = role === "admin";

  const readModel = await getTutorScheduleReadModel({
    tutorId: session.user.id,
    allowAdmin: isAdmin,
  });

  return (
    <ApplicationPage>
      <TutorScheduleView
        initialData={readModel}
        currentUserId={session.user.id}
      />
    </ApplicationPage>
  );
}
