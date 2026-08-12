import { PublicFormViewer } from "@/components/forms/public-form-viewer";

export default async function ShortFormPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <PublicFormViewer idOrSlug={slug} />;
}
