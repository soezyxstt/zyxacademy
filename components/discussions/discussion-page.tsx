import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ApplicationPage } from "@/components/application-page";
import { PageHeader } from "@/components/page-header";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { Button } from "@/components/ui/button";
import { MessageSquareText } from "lucide-react";
import { getAuthSession } from "@/lib/auth-session";
import { requireDiscussionCourse, resolveDiscussionCourses } from "@/lib/discussions/access";
import { getSessionDiscussionActor } from "@/lib/discussions/session";
import { getEquippedZyraAppearance } from "@/lib/gamification/queries";
import { getTranslations } from "@/lib/i18n/server";
import { DiscussionClient } from "./discussion-client";

export async function DiscussionPage({ courseId, surface }: { courseId?: string; surface: "student" | "tutor" | "admin" }) {
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/sign-in");
  const t = await getTranslations("discussions");
  let actor;
  let courseKey: string | undefined;
  const pageClassName = surface === "admin"
    ? "px-0 pb-2 pt-0 sm:px-0 sm:pb-2 sm:pt-0 lg:px-0"
    : "pb-2 pt-2 sm:pb-3 sm:pt-3";
  try {
    actor = await getSessionDiscussionActor();
    if ((surface === "admin" && actor.role !== "admin") || (surface === "tutor" && actor.role !== "tutor" && actor.role !== "admin")) throw new Error();
    if (courseId) {
      const access = (await resolveDiscussionCourses(actor, [courseId])).get(courseId);
      if (!access?.hasFullContentAccess || access.reason) throw new Error();
      await requireDiscussionCourse(actor, access.canonicalCourseId, access.legacyCourseId);
      courseKey = access.canonicalCourseId ?? access.legacyCourseId ?? undefined;
      if (!courseKey) throw new Error();
    }
  } catch {
    return <ApplicationPage data-discussion-page spacing="space-y-2" className={pageClassName}><PageHeader title={t("title")} /><AdminEmptyState icon={MessageSquareText} title={t("pageUnavailable")} description={t("accessChanged")} action={<Button asChild variant="outline"><Link href={surface === "student" ? "/dashboard" : surface === "tutor" ? "/tutor" : "/admin"}>{t("backDashboard")}</Link></Button>} /></ApplicationPage>;
  }
  const appearance = await getEquippedZyraAppearance(actor.id).catch(() => ({ skinId: null }));
  const backHref = courseId ? surface === "tutor" ? `/tutor/${encodeURIComponent(courseId)}` : `/courses/${encodeURIComponent(courseId)}` : undefined;
  return <ApplicationPage data-discussion-page spacing="space-y-2" className={pageClassName}>
    <PageHeader title={t("title")} backHref={backHref} className="mb-2" />
    <Suspense fallback={<p role="status">{t("loadingThread")}</p>}>
      <DiscussionClient key={`${actor.id}:${courseKey ?? "all"}:${surface}`} viewer={{ id: actor.id, name: session.user.name || t("unknownUser"), role: actor.role, skinId: appearance.skinId }} courseId={courseKey} />
    </Suspense>
  </ApplicationPage>;
}
