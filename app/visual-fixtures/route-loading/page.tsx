import { notFound } from "next/navigation";
import Loading0 from "@/app/(admin)/admin/(academic)/courses/[slug]/analytics/[quizId]/loading";
import Loading1 from "@/app/(admin)/admin/(academic)/courses/[slug]/analytics/loading";
import Loading2 from "@/app/(admin)/admin/(academic)/courses/[slug]/documents/[materialId]/loading";
import Loading3 from "@/app/(admin)/admin/(academic)/courses/[slug]/documents/loading";
import Loading4 from "@/app/(admin)/admin/(academic)/courses/[slug]/flashcards/loading";
import Loading5 from "@/app/(admin)/admin/(academic)/courses/[slug]/leaderboard/loading";
import Loading6 from "@/app/(admin)/admin/(academic)/courses/[slug]/loading";
import Loading7 from "@/app/(admin)/admin/(academic)/courses/[slug]/questions/loading";
import Loading8 from "@/app/(admin)/admin/(academic)/courses/[slug]/quizzes/[id]/edit/loading";
import Loading9 from "@/app/(admin)/admin/(academic)/courses/[slug]/quizzes/loading";
import Loading10 from "@/app/(admin)/admin/(academic)/courses/[slug]/quizzes/new/loading";
import Loading11 from "@/app/(admin)/admin/(academic)/courses/[slug]/results/loading";
import Loading12 from "@/app/(admin)/admin/(academic)/courses/[slug]/review/idea/[bundleId]/loading";
import Loading13 from "@/app/(admin)/admin/(academic)/courses/[slug]/review/loading";
import Loading14 from "@/app/(admin)/admin/(academic)/courses/[slug]/review/product/[bundleId]/loading";
import Loading15 from "@/app/(admin)/admin/(academic)/courses/[slug]/settings/loading";
import Loading16 from "@/app/(admin)/admin/(academic)/courses/[slug]/tryouts/loading";
import Loading17 from "@/app/(admin)/admin/(academic)/courses/[slug]/videos/loading";
import Loading18 from "@/app/(admin)/admin/(academic)/courses/loading";
import Loading19 from "@/app/(admin)/admin/(academic)/groups/loading";
import Loading20 from "@/app/(admin)/admin/(academic)/notifications/loading";
import Loading21 from "@/app/(admin)/admin/(academic)/schedules/loading";
import Loading22 from "@/app/(admin)/admin/(academic)/tokens/loading";
import Loading23 from "@/app/(admin)/admin/(academic)/tutorial-pka/announcements/loading";
import Loading24 from "@/app/(admin)/admin/(academic)/tutorial-pka/registrations/loading";
import Loading25 from "@/app/(admin)/admin/(academic)/tutorial-pka/schedules/loading";
import Loading26 from "@/app/(admin)/admin/(academic)/users/loading";
import Loading27 from "@/app/(admin)/admin/(content)/ast-inspector/loading";
import Loading28 from "@/app/(admin)/admin/(eval)/distractors/loading";
import Loading29 from "@/app/(admin)/admin/(eval)/jobs/loading";
import Loading30 from "@/app/(admin)/admin/(eval)/questions/loading";
import Loading31 from "@/app/(admin)/admin/blog/[id]/edit/loading";
import Loading32 from "@/app/(admin)/admin/blog/loading";
import Loading33 from "@/app/(admin)/admin/blog/new/loading";
import Loading34 from "@/app/(admin)/admin/media/loading";
import Loading35 from "@/app/(admin)/admin/ops/feature-usage/loading";
import Loading36 from "@/app/(admin)/admin/ops/tutor-activity/loading";
import Loading37 from "@/app/(admin)/admin/ops/web-analytics/loading";
import Loading38 from "@/app/(admin)/admin/pricing/loading";
import Loading39 from "@/app/(admin)/admin/tautan/loading";
import Loading40 from "@/app/(tutor)/tutor/[courseId]/grading/loading";
import Loading41 from "@/app/(tutor)/tutor/[courseId]/live/loading";
import Loading42 from "@/app/(tutor)/tutor/[courseId]/loading";
import Loading43 from "@/app/(tutor)/tutor/[courseId]/materials/loading";
import Loading44 from "@/app/(tutor)/tutor/[courseId]/participants/loading";
import Loading45 from "@/app/(tutor)/tutor/[courseId]/quizzes/[templateId]/attempts/loading";
import Loading46 from "@/app/(tutor)/tutor/[courseId]/quizzes/[templateId]/edit/loading";
import Loading47 from "@/app/(tutor)/tutor/[courseId]/quizzes/grading/loading";
import Loading48 from "@/app/(tutor)/tutor/[courseId]/quizzes/loading";
import Loading49 from "@/app/(tutor)/tutor/[courseId]/quizzes/new/loading";
import Loading50 from "@/app/(tutor)/tutor/[courseId]/videos/loading";
import Loading51 from "@/app/(tutor)/tutor/loading";
import Loading52 from "@/app/(tutor)/tutor/schedule/loading";

export const dynamic = "force-dynamic";

const states = {
  "admin/courses/[slug]/analytics/[quizId]": Loading0,
  "admin/courses/[slug]/analytics": Loading1,
  "admin/courses/[slug]/documents/[materialId]": Loading2,
  "admin/courses/[slug]/documents": Loading3,
  "admin/courses/[slug]/flashcards": Loading4,
  "admin/courses/[slug]/leaderboard": Loading5,
  "admin/courses/[slug]": Loading6,
  "admin/courses/[slug]/questions": Loading7,
  "admin/courses/[slug]/quizzes/[id]/edit": Loading8,
  "admin/courses/[slug]/quizzes": Loading9,
  "admin/courses/[slug]/quizzes/new": Loading10,
  "admin/courses/[slug]/results": Loading11,
  "admin/courses/[slug]/review/idea/[bundleId]": Loading12,
  "admin/courses/[slug]/review": Loading13,
  "admin/courses/[slug]/review/product/[bundleId]": Loading14,
  "admin/courses/[slug]/settings": Loading15,
  "admin/courses/[slug]/tryouts": Loading16,
  "admin/courses/[slug]/videos": Loading17,
  "admin/courses": Loading18,
  "admin/groups": Loading19,
  "admin/notifications": Loading20,
  "admin/schedules": Loading21,
  "admin/tokens": Loading22,
  "admin/tutorial-pka/announcements": Loading23,
  "admin/tutorial-pka/registrations": Loading24,
  "admin/tutorial-pka/schedules": Loading25,
  "admin/users": Loading26,
  "admin/ast-inspector": Loading27,
  "admin/distractors": Loading28,
  "admin/jobs": Loading29,
  "admin/questions": Loading30,
  "admin/blog/[id]/edit": Loading31,
  "admin/blog": Loading32,
  "admin/blog/new": Loading33,
  "admin/media": Loading34,
  "admin/ops/feature-usage": Loading35,
  "admin/ops/tutor-activity": Loading36,
  "admin/ops/web-analytics": Loading37,
  "admin/pricing": Loading38,
  "admin/tautan": Loading39,
  "tutor/[courseId]/grading": Loading40,
  "tutor/[courseId]/live": Loading41,
  "tutor/[courseId]": Loading42,
  "tutor/[courseId]/materials": Loading43,
  "tutor/[courseId]/participants": Loading44,
  "tutor/[courseId]/quizzes/[templateId]/attempts": Loading45,
  "tutor/[courseId]/quizzes/[templateId]/edit": Loading46,
  "tutor/[courseId]/quizzes/grading": Loading47,
  "tutor/[courseId]/quizzes": Loading48,
  "tutor/[courseId]/quizzes/new": Loading49,
  "tutor/[courseId]/videos": Loading50,
  "tutor": Loading51,
  "tutor/schedule": Loading52,
} as const;

export default async function RouteLoadingFixture({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { state } = await searchParams;
  if (!state || !Object.hasOwn(states, state)) notFound();
  const Loading = states[state as keyof typeof states];
  const isAdmin = state.startsWith("admin/");
  return <main className={isAdmin ? "min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8" : "min-h-screen bg-background"}><Loading /></main>;
}
