import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { SolutionCollectionReader } from "@/components/course/solution-collection-reader";
import { getAuthSession } from "@/lib/auth-session";
import { getPublishedSolutionCollection } from "@/lib/solutions/repository";

export const metadata: Metadata = { title: "Pembahasan soal", robots: { index: false, follow: false } };

type Props = { params: Promise<{ id: string; collectionId: string }> };

export default async function SolutionCollectionPage({ params }: Props) {
  const { id, collectionId } = await params;
  const session = await getAuthSession();
  const path = `/courses/${encodeURIComponent(id)}/solutions/${encodeURIComponent(collectionId)}`;
  if (!session?.user?.id) redirect(`/sign-in?next=${encodeURIComponent(path)}`);
  const product = await getPublishedSolutionCollection({ courseId: id, collectionId, userId: session.user.id });
  if (!product) notFound();
  return <SolutionCollectionReader collection={product.collection}
    courseHref={`/courses/${encodeURIComponent(id)}`}
    backHref={`/courses/${encodeURIComponent(id)}/material?tab=bank_soal`} />;
}
