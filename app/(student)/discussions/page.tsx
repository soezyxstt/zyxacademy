import { notFound, redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth-session";
import { getSessionDiscussionActor } from "@/lib/discussions/session";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const input = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
    else if (value !== undefined) query.set(key, value);
  }
  const href = `/discussions${query.size ? `?${query}` : ""}`;
  if (!(await getAuthSession())?.user?.id) redirect(`/sign-in?${new URLSearchParams({ next: href })}`);
  const actor = await getSessionDiscussionActor().catch(() => null);
  if (!actor) notFound();
  const base = actor.role === "admin" ? "/admin/discussions" : actor.role === "tutor" ? "/tutor/discussions" : "/dashboard/discussions";
  redirect(`${base}${query.size ? `?${query}` : ""}`);
}
