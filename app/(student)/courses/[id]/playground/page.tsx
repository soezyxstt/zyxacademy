import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { Code2 } from "lucide-react";
import { auth } from "@/lib/auth";
import { resolveCourseAccess } from "@/lib/student/course-access";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { Playground } from "@/components/coding/playground";

export default async function PlaygroundPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) redirect(`/sign-in?next=${encodeURIComponent(`/courses/${id}/playground`)}`);
  const access = await resolveCourseAccess({ courseId: id, userId: session.user.id });
  if (!access.hasCourseAccess) notFound();
  return <CoursePageShell title="Playground Python" icon={Code2}><div data-plain-canvas><Suspense fallback={<p role="status">Memuat Playground...</p>}><Playground courseId={access.canonicalCourseId ?? id} learnerId={session.user.id} /></Suspense></div></CoursePageShell>;
}
