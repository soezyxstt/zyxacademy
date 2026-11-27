import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ApplicationPage } from "@/components/application-page";
import { PageHeader } from "@/components/page-header";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { Button } from "@/components/ui/button";
import { MessageSquareText } from "lucide-react";
import { getAuthSession } from "@/lib/auth-session";
import { getStudentDiscussionListScope, requireDiscussionCourse, resolveDiscussionCourses } from "@/lib/discussions/access";
import { getSessionDiscussionActor } from "@/lib/discussions/session";
import { getEquippedZyraAppearance } from "@/lib/gamification/queries";
import { getTranslations } from "@/lib/i18n/server";
import { DiscussionClient } from "./discussion-client";
import { DiscussionWorkspaceSkeleton } from "./discussion-skeleton";

export async function DiscussionPage({ courseId, surface }: { courseId?: string; surface: "student" | "tutor" | "admin" }) {
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/sign-in");
  const t = await getTranslations("discussions");
  let actor;
  let courseKey: string | undefined;
  const pageClassName = surface === "admin"
    ? "-mx-(--page-gutter) w-auto max-w-none px-0 pb-2 pt-0 md:mx-auto md:w-full md:max-w-7xl md:px-0 md:pb-2 md:pt-0"
    : "px-0 pb-2 pt-2 md:px-(--page-gutter) md:pb-3 md:pt-3";
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
    return <ApplicationPage data-discussion-page spacing="space-y-(--compact-gap)" className={pageClassName}><PageHeader title={t("title")} /><AdminEmptyState icon={MessageSquareText} title={t("pageUnavailable")} description={t("accessChanged")} action={<Button asChild variant="outline"><Link href={surface === "student" ? "/dashboard" : surface === "tutor" ? "/tutor" : "/admin"}>{t("backDashboard")}</Link></Button>} /></ApplicationPage>;
  }
  const [appearance, listAccess] = await Promise.all([
    getEquippedZyraAppearance(actor.id).catch(() => ({ skinId: null })),
    surface === "student" && actor.role === "student" && !courseId
      ? getStudentDiscussionListScope(actor).catch(() => null)
      : null,
  ]);
  const listScope = listAccess && session.session?.id ? { ...listAccess, sessionId: session.session.id } : undefined;
  const backHref = courseId ? surface === "tutor" ? `/tutor/${encodeURIComponent(courseId)}` : `/courses/${encodeURIComponent(courseId)}` : undefined;
  return <ApplicationPage data-discussion-page spacing="space-y-(--compact-gap)" className={pageClassName}>
    <PageHeader title={t("title")} backHref={backHref} className={backHref ? "px-3 md:px-0" : undefined} />
    <Suspense fallback={<DiscussionWorkspaceSkeleton label={t("loadingThread")} />}>
      <DiscussionClient key={`${actor.id}:${courseKey ?? "all"}:${surface}`} viewer={{ id: actor.id, name: session.user.name || t("unknownUser"), role: actor.role, skinId: appearance.skinId }} courseId={courseKey} listScope={listScope} />
    </Suspense>
  </ApplicationPage>;
}
