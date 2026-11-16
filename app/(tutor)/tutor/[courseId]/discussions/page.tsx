import { DiscussionPage } from "@/components/discussions/discussion-page";

export default async function Page({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  return <DiscussionPage surface="tutor" courseId={courseId} />;
}
