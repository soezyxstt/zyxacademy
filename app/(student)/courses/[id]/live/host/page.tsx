import { redirect } from "next/navigation";

type Props = { params: Promise<{ id: string }> };

export default async function LegacyCourseLiveHostPage({ params }: Props) {
  const { id } = await params;
  redirect(`/tutor/${id}/live`);
}
