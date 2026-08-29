import { redirect } from "next/navigation";

type Props = { params: Promise<{ courseId: string }> };

export default async function TutorMaterialsPage({ params }: Props) {
  const { courseId } = await params;
  redirect(`/tutor/${courseId}`);
}
