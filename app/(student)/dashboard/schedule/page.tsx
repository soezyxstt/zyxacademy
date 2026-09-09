import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasAnyPeran } from "@/lib/auth/authorization";
import { StudentScheduleClient } from "./schedule-client";

export default async function StudentSchedulePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) redirect("/");

  const legacyRole = (session.user as { role?: string | null }).role;
  const isAdmin = legacyRole === "admin" || await hasAnyPeran(session.user.id, ["admin"], { allowAdmin: false });
  if (isAdmin) redirect("/admin/schedules");

  const isTutor = legacyRole === "teacher" || await hasAnyPeran(session.user.id, ["tutor"], { allowAdmin: false });
  if (isTutor) redirect("/tutor/schedule");

  return <StudentScheduleClient />;
}
