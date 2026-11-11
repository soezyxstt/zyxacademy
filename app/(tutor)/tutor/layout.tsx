import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { hasAnyPeran } from "@/lib/auth/request-cache";

export default async function TutorLayout({ children }: { children: React.ReactNode }) {

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/");

  if (!(await hasAnyPeran(session.user.id, ["tutor"], { allowAdmin: true }))) redirect("/");

  return <>{children}</>;
}
