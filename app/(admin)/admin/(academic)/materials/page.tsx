import { redirect } from "next/navigation";

type Props = {
  searchParams: Promise<{ tab?: string; section?: string }>;
};

export default async function MaterialsWorkspacePage({ searchParams }: Props) {
  const params = await searchParams;
  if (params.tab === "manual") redirect("/admin/materials/manual");
  redirect(params.section === "product" ? "/admin/materials/review?section=product" : "/admin/materials/review");
}
