import { DiscussionPage } from "@/components/discussions/discussion-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DiscussionPage surface="student" courseId={id} />;
}
