import { pageTitle } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getTranslations("adminOps");
  return { title: pageTitle(t("blog.title")), description: t("blog.description") };
}

export default function AdminBlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
