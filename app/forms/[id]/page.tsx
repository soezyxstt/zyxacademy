import { PublicFormViewer } from "@/components/forms/public-form-viewer";

export default async function FullFormPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PublicFormViewer idOrSlug={id} />;
}
