import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { env } from "@/lib/env";
import { hasAnyPeran } from "@/lib/auth/authorization";

export default async function TutorLayout({ children }: { children: React.ReactNode }) {
  if (env.FEATURE_TUTOR_ANALYTICS !== "1") redirect("/");

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/");

  if (env.FEATURE_PERAN_V2 === "1") {
    if (!(await hasAnyPeran(session.user.id, ["tutor"], { allowAdmin: true }))) redirect("/");
  } else {
    const role = (session.user as { role?: string | null }).role;
    if (role !== "teacher" && role !== "admin") redirect("/");
  }

  return <>{children}</>;
}
